/**
 * AI Flavor Enrichment (BB-185).
 *
 * `enrichBottleFlavor` generates a bottle's characteristic nose/palate/finish
 * tasting notes with the LLM, CONSTRAINED to the BB-181 canonical vocabulary,
 * and caches the result on the `/bourbons` doc. The model's output is always run
 * back through `matchCanonicalTags`, so only controlled tags are stored — never
 * verbatim third-party prose. Enrich-once (gated by `flavorEnrichedAt`) keeps
 * the cost flat: a bottle hits the model at most once unless `refresh` is asked.
 *
 * The consuming UI (pre-fill on log) is BB-186; the news-feed flavor feed is a
 * follow-on pass.
 */
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { CANONICAL_FLAVOR_TAGS, matchCanonicalTags } from "./flavor-taxonomy";
import { GROQ_API_KEY, GROQ_MODEL, RateLimitError, chatJson } from "./groq";

const MAX_TAGS_PER_STAGE = 6;

export interface FlavorTags {
  nose: string[];
  palate: string[];
  finish: string[];
}

interface BottleContext {
  name: string;
  distillery?: string | null;
  category?: string | null;
}

/** Build the constrained prompt from a bottle's identity. */
export function buildFlavorPrompt(bottle: BottleContext): {
  system: string;
  user: string;
} {
  const system =
    "You are a whiskey tasting-note expert. For the given bottle, list its most " +
    "characteristic tasting notes for nose, palate, and finish. Choose ONLY from " +
    "this allowed tag list, spelled EXACTLY as shown:\n" +
    CANONICAL_FLAVOR_TAGS.join(", ") +
    ".\nReply ONLY with JSON: " +
    '{"nose":[],"palate":[],"finish":[]}. Use 3-6 tags per section, only labels ' +
    "from the list, no duplicates, no descriptions, no invented tags. If you are " +
    "genuinely unsure about a bottle, return fewer tags rather than guessing.";

  const parts = [`Bottle: ${bottle.name}`];
  if (bottle.distillery) {
    parts.push(`Distillery: ${bottle.distillery}`);
  }
  if (bottle.category) {
    parts.push(`Category: ${bottle.category}`);
  }
  return { system, user: parts.join(" | ") };
}

/** Coerce raw model output into canonical-only, deduped, capped tag arrays. */
export function sanitizeFlavorTags(raw: unknown): FlavorTags {
  const r = (raw ?? {}) as Record<string, unknown>;
  const asStrings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  const clean = (v: unknown): string[] =>
    matchCanonicalTags(asStrings(v)).slice(0, MAX_TAGS_PER_STAGE);
  return {
    nose: clean(r["nose"]),
    palate: clean(r["palate"]),
    finish: clean(r["finish"]),
  };
}

/** True if enrichment produced at least one usable tag. */
export function hasAnyTags(t: FlavorTags): boolean {
  return t.nose.length + t.palate.length + t.finish.length > 0;
}

/**
 * Feed (a), BB-185: turn an article's raw flavor cues into canonical seed tags,
 * or null if the article carried no usable (canonical) tasting notes. Same
 * matcher/guardrail as on-demand enrichment — never stores verbatim prose.
 */
export function articleFlavorSeed(rawFlavor: unknown): FlavorTags | null {
  const tags = sanitizeFlavorTags(rawFlavor);
  return hasAnyTags(tags) ? tags : null;
}

/** Prompt the model then sanitize its reply to canonical tags. */
export async function generateFlavorTags(
  bottle: BottleContext,
  apiKey: string
): Promise<FlavorTags> {
  const { system, user } = buildFlavorPrompt(bottle);
  const raw = await chatJson(apiKey, system, user, 400);
  return sanitizeFlavorTags(raw);
}

/** Minimal write surface — a Firestore DocumentReference satisfies this. */
export interface EnrichTarget {
  update(data: Record<string, unknown>): Promise<unknown>;
}

interface StoredBottle {
  name: string;
  distillery?: string | null;
  category?: string | null;
  flavorEnrichedAt?: unknown;
  flavorProfile?: unknown;
}

export interface EnrichResult {
  status: "cached" | "empty" | "generated" | "refreshed";
  flavorProfile: unknown;
}

/**
 * The enrichment decision + write, decoupled from Firestore/Groq/onCall so it's
 * unit-testable. `generate` is injected (the onCall binds the real Groq call).
 */
export async function applyEnrichment(
  ref: EnrichTarget,
  bottle: StoredBottle,
  refresh: boolean,
  generate: (b: BottleContext) => Promise<FlavorTags>
): Promise<EnrichResult> {
  // Enrich-once: a bottle hits the model at most once unless a refresh is asked.
  if (bottle.flavorEnrichedAt && !refresh) {
    return { status: "cached", flavorProfile: bottle.flavorProfile ?? null };
  }

  const tags = await generate({
    name: bottle.name,
    distillery: bottle.distillery,
    category: bottle.category,
  });

  // Mark enriched either way, so a bottle the model can't place isn't re-tried
  // on every open. Store null when nothing confident came back.
  if (!hasAnyTags(tags)) {
    await ref.update({
      flavorProfile: null,
      flavorEnrichedAt: FieldValue.serverTimestamp(),
    });
    return { status: "empty", flavorProfile: null };
  }

  const flavorProfile = {
    ...tags,
    source: "ai" as const,
    model: GROQ_MODEL,
    generatedAt: Timestamp.now(),
  };
  await ref.update({
    flavorProfile,
    flavorEnrichedAt: FieldValue.serverTimestamp(),
  });
  return {
    status: refresh ? "refreshed" : "generated",
    // Return the canonical tags for immediate use; the doc carries the full
    // profile (with the server timestamp) for listeners.
    flavorProfile: { ...tags, source: "ai", model: GROQ_MODEL },
  };
}

export const enrichBottleFlavor = onCall(
  { region: "us-central1", secrets: [GROQ_API_KEY] },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign in to enrich a bottle.");
    }
    const data = request.data as { bourbonId?: string; refresh?: boolean };
    const bourbonId = data?.bourbonId;
    if (!bourbonId || typeof bourbonId !== "string") {
      throw new HttpsError("invalid-argument", "A bourbonId is required.");
    }
    const refresh = data?.refresh === true;

    const db = getFirestore();
    const ref = db.collection("bourbons").doc(bourbonId);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "Bottle not found.");
    }
    const bottle = snap.data() as StoredBottle;

    try {
      const result = await applyEnrichment(ref, bottle, refresh, (b) =>
        generateFlavorTags(b, GROQ_API_KEY.value())
      );
      if (result.status !== "cached") {
        logger.info(`Flavor enrichment ${result.status} for ${bourbonId}.`);
      }
      return result;
    } catch (err) {
      if (err instanceof RateLimitError) {
        throw new HttpsError(
          "resource-exhausted",
          "Flavor service is busy. Try again shortly."
        );
      }
      logger.warn(`Flavor enrichment failed for ${bourbonId}`, err);
      throw new HttpsError("internal", "Couldn't generate flavor notes.");
    }
  }
);
