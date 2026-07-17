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
import { onSchedule } from "firebase-functions/v2/scheduler";

import {
  consumeDailyLimit,
  ENFORCE_APP_CHECK,
  requireAdmin,
  requireApproved,
} from "../shared/guards";
import { CANONICAL_FLAVOR_TAGS, matchCanonicalTags } from "./flavor-taxonomy";
import { GROQ_API_KEY, GROQ_MODEL, RateLimitError, chatJson } from "./groq";
// Deliberate require-cycle with ./similarity (it uses our pure tag helpers,
// we call its recompute at request time) — safe because neither side touches
// the other at module-init.
import { recomputeNeighborsIfStale } from "./similarity";

const MAX_TAGS_PER_STAGE = 6;

// Bump when the prompt/temperature change enough that existing profiles are
// worth regenerating (BB-196). Profiles carry the version they were generated
// with; `needsPromptUpgrade` + the force sweep bring old ones up to date.
export const FLAVOR_PROMPT_VERSION = 2;

// Temp 0 made every bourbon "vanilla/caramel/oak/cinnamon" (BB-196): the model
// returned the single most-stereotypical profile per category. Some sampling
// variety plus the distinguishing fields below is what separates bottles.
const FLAVOR_TEMPERATURE = 0.4;

export interface FlavorTags {
  nose: string[];
  palate: string[];
  finish: string[];
}

interface BottleContext {
  name: string;
  distillery?: string | null;
  category?: string | null;
  subType?: string | null;
  proof?: number | null;
  ageStatement?: string | null;
  series?: string | null;
}

/** Build the constrained prompt from a bottle's identity. */
export function buildFlavorPrompt(bottle: BottleContext): {
  system: string;
  user: string;
} {
  const system =
    "You are a whiskey tasting-note expert. For the given bottle, list its most " +
    "characteristic tasting notes for nose, palate, and finish. Favor the notes " +
    "that DISTINGUISH this bottle from other whiskeys of its category — let the " +
    "mash bill, proof, age, and cask influence show — rather than generic " +
    "category defaults. Choose ONLY from " +
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
  if (bottle.subType) {
    parts.push(`Type: ${bottle.subType}`);
  }
  if (bottle.proof != null) {
    parts.push(`Proof: ${bottle.proof}`);
  }
  if (bottle.ageStatement) {
    parts.push(`Age: ${bottle.ageStatement}`);
  }
  if (bottle.series) {
    parts.push(`Series: ${bottle.series}`);
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

// A profile is "adequate" (BB-185) when it's a real profile, not a thin seed:
// enough tags, spread across enough stages. Tunable knobs.
export const MIN_TOTAL_TAGS = 5;
export const MIN_STAGES = 2;

/** Whether a profile is solid enough to stop enriching (gate for feed b). */
export function isAdequateProfile(t: FlavorTags): boolean {
  const total = t.nose.length + t.palate.length + t.finish.length;
  const stages = [t.nose, t.palate, t.finish].filter((s) => s.length > 0).length;
  return total >= MIN_TOTAL_TAGS && stages >= MIN_STAGES;
}

/** Read canonical tag arrays out of a stored FlavorProfile (already canonical). */
export function profileToTags(profile: unknown): FlavorTags {
  const p = (profile ?? {}) as Record<string, unknown>;
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  return { nose: arr(p["nose"]), palate: arr(p["palate"]), finish: arr(p["finish"]) };
}

/** Union two tag sets per stage (existing first), deduped and capped. */
export function mergeFlavorTags(a: FlavorTags, b: FlavorTags): FlavorTags {
  const union = (x: string[], y: string[]): string[] => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const t of [...x, ...y]) {
      if (!seen.has(t)) {
        seen.add(t);
        out.push(t);
      }
    }
    return out.slice(0, MAX_TAGS_PER_STAGE);
  };
  return {
    nose: union(a.nose, b.nose),
    palate: union(a.palate, b.palate),
    finish: union(a.finish, b.finish),
  };
}

/** Structural equality of two tag sets (order-sensitive, matching merge output). */
export function sameTags(a: FlavorTags, b: FlavorTags): boolean {
  const eq = (x: string[], y: string[]): boolean =>
    x.length === y.length && x.every((v, i) => v === y[i]);
  return eq(a.nose, b.nose) && eq(a.palate, b.palate) && eq(a.finish, b.finish);
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

// ————— Flavor tag provenance (BB-222) —————
//
// The trust ladder (owner decision 2026-07-17): user-confirmed (BB-188, later)
// > review/listicle mentions (enter the arrays, counted in tagCounts) > AI
// feed-b suggestions (arrays only, uncounted) > marketing claims (counted in
// marketingTagCounts, NEVER in the arrays — so they can't consume the stage
// cap or feed Taste Match / Similar Bottles). Marketing acts as a weak
// corroborator at display time only.

/** Per-article idempotency window. Old ids fall off; their counts remain. */
export const SEEDED_IDS_CAP = 30;

export interface FlavorProvenance {
  tagCounts: Record<string, number>; // non-marketing article mentions per tag
  marketingTagCounts: Record<string, number>; // press-release claims per tag
  seededArticleIds: string[]; // articles already counted (idempotency)
  reviewCount: number; // non-marketing articles that seeded
}

/** Read provenance out of a stored profile, tolerating legacy/garbage shapes. */
export function profileProvenance(profile: unknown): FlavorProvenance {
  const p = (profile ?? {}) as Record<string, unknown>;
  const counts = (v: unknown): Record<string, number> => {
    if (!v || typeof v !== "object" || Array.isArray(v)) {
      return {};
    }
    const out: Record<string, number> = {};
    for (const [tag, n] of Object.entries(v as Record<string, unknown>)) {
      if (typeof n === "number" && Number.isFinite(n) && n > 0) {
        out[tag] = n;
      }
    }
    return out;
  };
  const reviewCount = p["reviewCount"];
  return {
    tagCounts: counts(p["tagCounts"]),
    marketingTagCounts: counts(p["marketingTagCounts"]),
    seededArticleIds: Array.isArray(p["seededArticleIds"])
      ? (p["seededArticleIds"] as unknown[]).filter(
          (x): x is string => typeof x === "string"
        )
      : [],
    reviewCount:
      typeof reviewCount === "number" && reviewCount > 0 ? reviewCount : 0,
  };
}

/** Whether any provenance exists — guards against nulling it away. */
export function hasProvenance(p: FlavorProvenance): boolean {
  return (
    p.reviewCount > 0 ||
    p.seededArticleIds.length > 0 ||
    Object.keys(p.tagCounts).length > 0 ||
    Object.keys(p.marketingTagCounts).length > 0
  );
}

export interface SeedResult {
  tags: FlavorTags;
  provenance: FlavorProvenance;
  changed: boolean;
}

/**
 * Apply one article's tasting notes to a bottle's profile state (BB-222).
 * Pure. Evaluative articles merge into the arrays and count in `tagCounts`;
 * marketing (press-release) articles count ONLY in `marketingTagCounts`.
 * Idempotent per articleId; a tag counts once per article no matter how many
 * stages mention it.
 */
export function applyArticleSeed(
  tags: FlavorTags,
  provenance: FlavorProvenance,
  seed: FlavorTags,
  articleId: string,
  evaluative: boolean
): SeedResult {
  if (provenance.seededArticleIds.includes(articleId)) {
    return { tags, provenance, changed: false };
  }
  const seedTags = [...new Set([...seed.nose, ...seed.palate, ...seed.finish])];
  if (seedTags.length === 0) {
    return { tags, provenance, changed: false };
  }
  const bump = (m: Record<string, number>): Record<string, number> => {
    const next = { ...m };
    for (const t of seedTags) {
      next[t] = (next[t] ?? 0) + 1;
    }
    return next;
  };
  const seededArticleIds = [...provenance.seededArticleIds, articleId].slice(
    -SEEDED_IDS_CAP
  );
  if (evaluative) {
    return {
      tags: mergeFlavorTags(tags, seed),
      provenance: {
        ...provenance,
        tagCounts: bump(provenance.tagCounts),
        reviewCount: provenance.reviewCount + 1,
        seededArticleIds,
      },
      changed: true,
    };
  }
  return {
    tags,
    provenance: {
      ...provenance,
      marketingTagCounts: bump(provenance.marketingTagCounts),
      seededArticleIds,
    },
    changed: true,
  };
}

/** Prompt the model then sanitize its reply to canonical tags. */
export async function generateFlavorTags(
  bottle: BottleContext,
  apiKey: string
): Promise<FlavorTags> {
  const { system, user } = buildFlavorPrompt(bottle);
  const raw = await chatJson(apiKey, system, user, 400, FLAVOR_TEMPERATURE);
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
  subType?: string | null;
  proof?: number | null;
  ageStatement?: string | null;
  series?: string | null;
  flavorEnrichedAt?: unknown;
  flavorProfile?: unknown;
}

/**
 * Whether a stored profile predates the current prompt version and should be
 * regenerated by the force sweep (BB-196). Bottles without a profile are the
 * normal sweep's job, not an upgrade.
 */
export function needsPromptUpgrade(bottle: {
  flavorProfile?: unknown;
}): boolean {
  const profile = bottle.flavorProfile as { promptVersion?: unknown } | null;
  if (!profile || typeof profile !== "object") {
    return false;
  }
  return profile.promptVersion !== FLAVOR_PROMPT_VERSION;
}

export interface EnrichResult {
  status: "cached" | "empty" | "generated" | "augmented" | "refreshed";
  flavorProfile: unknown;
}

/**
 * The enrichment decision + write, decoupled from Firestore/Groq/onCall so it's
 * unit-testable. `generate` is injected (the onCall binds the real Groq call).
 *
 * Gate is ADEQUACY, not mere existence (BB-185): a thin/partial profile is
 * upgraded rather than locked, and the freshly generated tags are MERGED into
 * whatever was already there (feed a + feed b accumulate). A `refresh` REPLACES
 * instead (BB-196) — its whole point is shedding a stale generic profile, and
 * merging would keep those tags in front forever — but an empty refresh result
 * never wipes what's there.
 */
export async function applyEnrichment(
  ref: EnrichTarget,
  bottle: StoredBottle,
  refresh: boolean,
  generate: (b: BottleContext) => Promise<FlavorTags>
): Promise<EnrichResult> {
  const existing = profileToTags(bottle.flavorProfile);

  // Already solid → no model call (cost control), unless a refresh is forced.
  if (isAdequateProfile(existing) && !refresh) {
    return { status: "cached", flavorProfile: bottle.flavorProfile ?? null };
  }

  const generated = await generate({
    name: bottle.name,
    distillery: bottle.distillery,
    category: bottle.category,
    subType: bottle.subType,
    proof: bottle.proof,
    ageStatement: bottle.ageStatement,
    series: bottle.series,
  });
  const chosen =
    refresh && hasAnyTags(generated)
      ? generated
      : refresh
        ? existing
        : mergeFlavorTags(existing, generated);

  // A refresh that produced nothing keeps the existing profile untouched.
  if (refresh && !hasAnyTags(generated) && hasAnyTags(existing)) {
    return { status: "cached", flavorProfile: bottle.flavorProfile ?? null };
  }

  // Provenance (BB-222) survives every regeneration — counts record what
  // articles said, which no feed-b generation can un-say.
  const provenance = profileProvenance(bottle.flavorProfile);

  // Record the attempt either way (a retry-cooldown for the sweep). Store null
  // only when there's genuinely nothing — never wipe existing tags, and never
  // wipe provenance (a marketing-only bottle has empty arrays but real claims).
  if (!hasAnyTags(chosen)) {
    if (hasProvenance(provenance)) {
      const flavorProfile = {
        ...chosen,
        ...provenance,
        source: "ai" as const,
        model: GROQ_MODEL,
        promptVersion: FLAVOR_PROMPT_VERSION,
        generatedAt: Timestamp.now(),
      };
      await ref.update({
        flavorProfile,
        flavorEnrichedAt: FieldValue.serverTimestamp(),
      });
      return { status: "empty", flavorProfile };
    }
    await ref.update({
      flavorProfile: null,
      flavorEnrichedAt: FieldValue.serverTimestamp(),
    });
    return { status: "empty", flavorProfile: null };
  }

  const flavorProfile = {
    ...chosen,
    ...provenance,
    source: "ai" as const,
    model: GROQ_MODEL,
    promptVersion: FLAVOR_PROMPT_VERSION,
    generatedAt: Timestamp.now(),
  };
  await ref.update({
    flavorProfile,
    flavorEnrichedAt: FieldValue.serverTimestamp(),
  });
  const status = refresh
    ? "refreshed"
    : hasAnyTags(existing)
      ? "augmented"
      : "generated";
  return {
    status,
    // Return the canonical tags for immediate use; the doc carries the full
    // profile (with the server timestamp) for listeners.
    flavorProfile: {
      ...chosen,
      source: "ai",
      model: GROQ_MODEL,
      promptVersion: FLAVOR_PROMPT_VERSION,
    },
  };
}

// A non-refresh call on an already-adequate bottle returns the cached profile,
// so organic use is self-limiting. `refresh: true` forces a new Groq generation
// + write every time — that's the loopable cost vector, so it gets a daily
// per-user budget (BB-190).
const DAILY_REFRESH_LIMIT = 10;

export const enrichBottleFlavor = onCall(
  {
    region: "us-central1",
    secrets: [GROQ_API_KEY],
    enforceAppCheck: ENFORCE_APP_CHECK,
  },
  async (request) => {
    const uid = requireApproved(request);
    const data = request.data as { bourbonId?: string; refresh?: boolean };
    const bourbonId = data?.bourbonId;
    if (!bourbonId || typeof bourbonId !== "string") {
      throw new HttpsError("invalid-argument", "A bourbonId is required.");
    }
    const refresh = data?.refresh === true;

    const db = getFirestore();
    if (refresh) {
      await consumeDailyLimit(
        db,
        uid,
        "flavorRefresh",
        DAILY_REFRESH_LIMIT,
        "Daily flavor-refresh limit reached. Try again tomorrow."
      );
    }
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

// --- Proactive backfill sweep (BB-185): bring inadequate catalog bottles up to
// standard even before anyone logs them, so the seeded DB has solid notes. ---

const SWEEP_LIMIT = 300; // catalog docs scanned per run (newest first)
// Pacing to stay well under the free-tier ~6K TPM: a flavor prompt is ~600
// tokens, so ~5 calls/min (12s) is comfortably safe.
const FLAVOR_SWEEP_SPACING_MS = 12000;
// Don't re-hit the model on a bottle it just couldn't place; retry only after
// this cooldown (data/model may improve).
const FLAVOR_RETRY_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function toMillis(v: unknown): number | null {
  if (typeof v === "number") return v;
  const t = v as { toMillis?: () => number } | null | undefined;
  return typeof t?.toMillis === "function" ? t.toMillis() : null;
}

/**
 * Whether the sweep should (re)enrich a bottle: only inadequate ones, and not
 * ones attempted within the retry cooldown (avoids hammering hopeless bottles).
 */
export function shouldSweepEnrich(
  bottle: { flavorProfile?: unknown; flavorEnrichedAt?: unknown },
  nowMs: number,
  cooldownMs: number
): boolean {
  if (isAdequateProfile(profileToTags(bottle.flavorProfile))) {
    return false;
  }
  const attemptedMs = toMillis(bottle.flavorEnrichedAt);
  if (attemptedMs != null && nowMs - attemptedMs < cooldownMs) {
    return false;
  }
  return true;
}

/**
 * Scan the newest catalog bottles and enrich the inadequate ones, paced.
 *
 * `force` (BB-196, admin backfill only): ALSO regenerate profiles written by an
 * older prompt version — scanning the whole catalog, replacing (not merging)
 * adequate stale profiles. The `promptVersion` stamp makes repeated force runs
 * resumable: already-upgraded bottles are skipped, so each call works through
 * the remainder until nothing is left.
 */
async function sweepEnrichInadequate(
  db: FirebaseFirestore.Firestore,
  apiKey: string,
  limit: number,
  force = false
): Promise<{ scanned: number; enriched: number; skipped: number; rateLimited: boolean }> {
  const snap = force
    ? await db.collection("bourbons").get()
    : await db
        .collection("bourbons")
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get();

  const now = Date.now();
  let enriched = 0;
  let skipped = 0;
  let rateLimited = false;
  for (const doc of snap.docs) {
    const data = doc.data();
    const upgrade = force && needsPromptUpgrade(data);
    if (!upgrade && !shouldSweepEnrich(data, now, FLAVOR_RETRY_COOLDOWN_MS)) {
      skipped++;
      continue;
    }
    // Replace only profiles that are both stale-version AND adequate; a thin
    // seed still merges so article-sourced tags aren't thrown away.
    const refresh = upgrade && isAdequateProfile(profileToTags(data.flavorProfile));
    try {
      await applyEnrichment(doc.ref, data as never, refresh, (b) =>
        generateFlavorTags(b, apiKey)
      );
      enriched++;
    } catch (err) {
      if (err instanceof RateLimitError) {
        rateLimited = true;
        break; // stop hammering a limited quota; the rest wait for next run
      }
      logger.warn(`Flavor sweep failed for ${doc.id}`, err);
      skipped++;
    }
    if (force && enriched >= limit) {
      break; // bounded work per call; promptVersion resumes the rest next call
    }
    await sleep(FLAVOR_SWEEP_SPACING_MS);
  }
  return { scanned: snap.size, enriched, skipped, rateLimited };
}

/** Hourly safety net: enrich inadequate catalog bottles (rate-paced, resumable). */
export const sweepFlavorEnrichment = onSchedule(
  {
    schedule: "every 60 minutes",
    region: "us-central1",
    secrets: [GROQ_API_KEY],
    timeoutSeconds: 540,
  },
  async () => {
    const db = getFirestore();
    const res = await sweepEnrichInadequate(db, GROQ_API_KEY.value(), SWEEP_LIMIT);
    logger.info(
      `Flavor sweep: scanned ${res.scanned}, enriched ${res.enriched}` +
        (res.rateLimited ? " (stopped: rate limited)." : ".")
    );
    // Neighbor lists follow profile changes (BB-197). Staleness-gated: costs
    // one read when no profile changed since the last recompute.
    await recomputeNeighborsIfStale(db);
  }
);

/** Manual, bounded trigger for the same sweep. Admin-only (BB-190). */
export const backfillFlavorEnrichment = onCall(
  {
    region: "us-central1",
    secrets: [GROQ_API_KEY],
    timeoutSeconds: 540,
    enforceAppCheck: ENFORCE_APP_CHECK,
  },
  async (request) => {
    requireAdmin(request);
    const data = request.data as { limit?: number; force?: boolean };
    const requested = Number(data?.limit);
    const limit = Math.min(
      Math.max(Number.isFinite(requested) ? requested : 50, 1),
      SWEEP_LIMIT
    );
    // force (BB-196): also regenerate stale-prompt-version profiles.
    const db = getFirestore();
    const res = await sweepEnrichInadequate(
      db,
      GROQ_API_KEY.value(),
      limit,
      data?.force === true
    );
    logger.info(
      `Flavor backfill: scanned ${res.scanned}, enriched ${res.enriched}` +
        (res.rateLimited ? " (stopped: rate limited)." : ".")
    );
    const similarity = await recomputeNeighborsIfStale(db);
    return { ...res, similarity };
  }
);
