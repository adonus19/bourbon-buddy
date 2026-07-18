/**
 * AI "Find Bottles" (BB-130).
 *
 * When a news article is written, extract the whiskey/bourbon product names it
 * mentions (via an LLM), match them to the shared catalog (creating the entry
 * from the AI-sourced fields when it's new), and cache the result ON THE ARTICLE. This runs ONCE per article, ever — never per user, per view,
 * or per refresh — so the cost is flat and tiny no matter how many people read
 * it. The client reads the cached `mentionedBottles` field; no per-user AI cost.
 *
 * Provider: Gemini API (BB-226 — Groq's Llama models shut down 2026-08-16).
 * Extraction runs on gemini-3.1-flash-lite with schema-constrained decoding;
 * model/limit rationale lives in ./gemini.ts. The key is a Secret Manager
 * secret (GEMINI_API_KEY), never in code. All model-specific code lives in
 * `extractBottleNames`, so swapping providers again is a one-function change.
 */
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";

import { ENFORCE_APP_CHECK, requireAdmin } from "../shared/guards";
import { normalizeBottleName } from "../shared/normalize";
import { buildModelText, fetchArticleBody } from "./article-text";
import { upsertCriticSignal } from "./critic-signals";
import {
  EXTRACTION_RESPONSE_SCHEMA,
  EXTRACTION_SYSTEM_PROMPT,
  ExtractedBottle,
  parseArticleType,
  parseExtractionResponse,
} from "./extraction";
import {
  EXTRACTION_MODEL,
  GEMINI_API_KEY,
  RateLimitError,
  generateText,
} from "./gemini";
import { parseRating } from "./rating";
import {
  applyArticleSeed,
  articleFlavorSeed,
  FlavorTags,
  hasArticleNotes,
  profileProvenance,
  profileToTags,
} from "./flavor-enrichment";

// AI Flavor Enrichment (BB-185) — canonical-constrained tasting notes, cached
// on /bourbons. Re-exported so the top-level barrel pulls it from "./ai".
export {
  enrichBottleFlavor,
  sweepFlavorEnrichment,
  backfillFlavorEnrichment,
} from "./flavor-enrichment";

// Crowdsourced flavor aggregation (BB-188) — community tier on the profile,
// maintained by a log-entry trigger. Re-exported so the barrel pulls it from "./ai".
export { onLogEntryWrittenAggregateFlavor } from "./community-flavor";

// Extraction is a judgment call — deciding that "award-winning bourbon" is
// prose and not a bottle (BB-201) — and its output feeds JSON.parse, so it
// runs on the Gemini model with real constrained decoding (BB-226; model +
// limit rationale in ./gemini.ts). Flavor enrichment runs on Gemma so the two
// features don't share a rate-limit budget.
// Bump when the extraction prompt/response shape changes enough that already-
// processed articles are worth re-extracting (BB-219). Articles carry the
// version they were extracted with; the sweep re-processes older ones.
// v2: article-stated facts (proof/ageYears/msrp/releaseType).
// v3: articleType classification + per-bottle verdict (BB-220) — press-release
//     flavor seeding stops, so re-extraction under v3 also matters for trust.
// v4: no prompt change — processing change (BB-222): press-release notes are
//     harvested again, into marketingTagCounts. Bumped to re-sweep v3 PRs
//     whose flavor cues were discarded.
const EXTRACTION_PROMPT_VERSION = 4;
// Range-guide articles can list 10+ expressions, so keep this generous.
const MAX_BOTTLES = 12;
// Output cap. Each bottle now carries facts + verdict + rating + a full flavor
// object, so a 7+ bottle listicle blew past 1024 tokens and the reply was
// truncated mid-JSON — the parse then failed and the WHOLE article yielded zero
// bottles (BB-227). 8192 fits ~12 fully-populated bottles with headroom; the
// parser also salvages a truncated reply as a backstop. Output tokens are cheap.
const MAX_OUTPUT_TOKENS = 8192;
// Feed the model the real article body, not just the teaser (BB-130 fix). ~5k
// chars ≈ 1.3k input tokens — enough to catch bottles named deep in a review.
const MAX_TEXT_CHARS = 5000;
// Below this, the stored bodyText is just a teaser (or absent) and we fetch the
// article URL to get the full body instead.
const MIN_BODY_CHARS = 600;
const BACKFILL_DEFAULT = 15;
const BACKFILL_MAX = 60;
// Pacing for the batch sweeps. flash-lite free tier (live numbers 2026-07-17):
// 15 RPM / 250K TPM / 500 RPD — RPD binds, not TPM. 6s spacing = 10/min, under
// RPM with headroom for the unpaced onCreate path; a full 200-article catch-up
// sweep costs 200 of the 500 RPD, fine as a burst. Bursting faster just 429s
// and stalls; steady pacing is faster end-to-end. (The realtime onCreate path
// isn't paced — a lone 429 there is deferred to the sweep on purpose.)
const BACKFILL_SPACING_MS = 6000;
const SWEEP_LIMIT = 200; // recent articles scanned per scheduled sweep
// Chip-flavor refresh: articles scanned per run, and Firestore's getAll batch cap.
const FLAVOR_REFRESH_LIMIT = 150;
const FLAVOR_REFRESH_MAX = 500;
const GET_ALL_CHUNK = 100;
const RATE_LIMITED = -2; // processArticle sentinel: hit the model rate limit

interface MentionedBottle {
  name: string;
  bourbonId: string | null;
  distillery: string | null;
  category: string | null;
  // Catalog flavor tags at extraction time (BB-199): lets feed chips show the
  // Taste Match badge without a per-chip read. Null when no profile exists yet.
  flavor: { nose: string[]; palate: string[]; finish: string[] } | null;
  // The writer's opinion of this bottle (BB-220); review/listicle articles only.
  verdict: string | null;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Runs once per new article: extract → match → cache on the article doc. */
export const extractBottlesFromArticle = onDocumentCreated(
  {
    document: "newsArticles/{articleId}",
    region: "us-central1",
    secrets: [GEMINI_API_KEY],
    // Cap concurrency so a bulk RSS fetch (dozens of new docs at once) doesn't
    // fire dozens of simultaneous model calls and blow the free-tier RPM.
    maxInstances: 2,
  },
  async (event) => {
    if (!event.data) {
      return;
    }
    const n = await processArticle(
      getFirestore(),
      event.data.ref,
      event.data.data(),
      GEMINI_API_KEY.value()
    );
    if (n >= 0) {
      logger.info(`Extracted ${n} bottle(s) for ${event.params.articleId}.`);
    } else if (n === RATE_LIMITED) {
      // Left unprocessed on purpose — a later fetch/backfill will pick it up.
      logger.warn(`Rate limited on ${event.params.articleId}; will retry later.`);
    }
  }
);

/**
 * Bounded backfill / test tool: extract bottles for the most recent articles
 * that haven't been processed yet. Admin-only (BB-190): it burns model quota and
 * catalog writes at will, so it's an operator tool, not a user feature.
 */
const REPROCESS_MAX_HOURS = 48; // forced-reprocess window ceiling

export const backfillArticleBottles = onCall(
  {
    region: "us-central1",
    secrets: [GEMINI_API_KEY],
    timeoutSeconds: 540,
    enforceAppCheck: ENFORCE_APP_CHECK,
  },
  async (request) => {
    requireAdmin(request);
    const data = request.data as {
      limit?: number;
      force?: boolean;
      sinceHours?: number;
    };
    const requested = Number(data?.limit);
    const limit = Math.min(
      Math.max(Number.isFinite(requested) ? requested : BACKFILL_DEFAULT, 1),
      BACKFILL_MAX
    );
    // force + sinceHours re-extracts already-processed articles fetched within
    // the window (used to reprocess after an extraction improvement, BB-130).
    const force = data?.force === true;
    const sinceHours = Number(data?.sinceHours);
    const sinceMs =
      force && Number.isFinite(sinceHours) && sinceHours > 0
        ? Date.now() - Math.min(sinceHours, REPROCESS_MAX_HOURS) * 3600_000
        : undefined;

    const res = await sweepUnprocessed(getFirestore(), GEMINI_API_KEY.value(), limit, {
      force,
      sinceMs,
    });
    logger.info(
      `Backfill${force ? " (force)" : ""}: scanned ${res.scanned}, processed ` +
        `${res.processed}` +
        (res.rateLimited ? " (stopped: rate limited)." : ".")
    );
    return res;
  }
);

/**
 * Scheduled safety net (BB-130): the onCreate trigger only fires for brand-new
 * article URLs, so pre-existing articles and re-fetched ones (updates) never get
 * extracted. This sweep periodically extracts any recent article still missing
 * bottlesExtractedAt, rate-paced and self-healing (stops on 429, resumes next run).
 */
export const sweepArticleBottles = onSchedule(
  {
    schedule: "every 30 minutes",
    region: "us-central1",
    secrets: [GEMINI_API_KEY],
    timeoutSeconds: 540,
  },
  async () => {
    const res = await sweepUnprocessed(
      getFirestore(),
      GEMINI_API_KEY.value(),
      SWEEP_LIMIT
    );
    logger.info(
      `Sweep: scanned ${res.scanned}, processed ${res.processed}` +
        (res.rateLimited ? " (stopped: rate limited)." : ".")
    );
  }
);

/**
 * Keeps chip flavor tags in step with the catalog (BB-199).
 *
 * `mentionedBottles[].flavor` is denormalized at extraction time so feed chips
 * can show the Taste Match badge without a per-chip read. But most article
 * bottles are *created* by that extraction and only get a profile later, when
 * the enrichment sweep reaches them — so their cached flavor stays null and the
 * badge never appears. This backfills it: recent articles only, catalog reads
 * deduped by bourbonId, and a write only when a chip actually gained tags.
 * No model calls, so it's free of the model-call pacing the extraction sweeps need.
 */
export const refreshArticleBottleFlavor = onSchedule(
  {
    schedule: "every 6 hours",
    region: "us-central1",
    timeoutSeconds: 300,
  },
  async () => {
    const res = await refreshChipFlavor(getFirestore(), FLAVOR_REFRESH_LIMIT);
    logger.info(
      `Chip flavor refresh: scanned ${res.scanned}, updated ${res.updated} ` +
        `article(s) from ${res.bottlesRead} catalog read(s).`
    );
  }
);

/**
 * Admin-only one-shot of the same refresh, so a deploy doesn't have to wait up
 * to 6 hours for chips to pick up flavor tags the catalog already has.
 */
export const backfillArticleBottleFlavor = onCall(
  {
    region: "us-central1",
    timeoutSeconds: 540,
    enforceAppCheck: ENFORCE_APP_CHECK,
  },
  async (request) => {
    requireAdmin(request);
    const requested = Number((request.data as { limit?: number })?.limit);
    const limit = Math.min(
      Math.max(Number.isFinite(requested) ? requested : FLAVOR_REFRESH_LIMIT, 1),
      FLAVOR_REFRESH_MAX
    );
    const res = await refreshChipFlavor(getFirestore(), limit);
    logger.info(
      `Chip flavor backfill: scanned ${res.scanned}, updated ${res.updated} ` +
        `article(s) from ${res.bottlesRead} catalog read(s).`
    );
    return res;
  }
);

/** True when a profile carries at least one tag in any stage. */
function hasTags(tags: FlavorTags | null | undefined): boolean {
  return !!tags && tags.nose.length + tags.palate.length + tags.finish.length > 0;
}

/**
 * Patches null `flavor` entries on recent articles' `mentionedBottles` from the
 * catalog. Returns counters for the log line. Never throws per-article.
 */
async function refreshChipFlavor(
  db: FirebaseFirestore.Firestore,
  limit: number
): Promise<{ scanned: number; updated: number; bottlesRead: number }> {
  const snap = await db
    .collection("newsArticles")
    .orderBy("fetchedAt", "desc")
    .limit(limit)
    .get();

  // One catalog read per distinct bottle across the whole scan, not per chip.
  const missing = new Set<string>();
  for (const doc of snap.docs) {
    const bottles = (doc.get("mentionedBottles") as MentionedBottle[]) ?? [];
    for (const b of bottles) {
      if (b.bourbonId && !hasTags(b.flavor)) {
        missing.add(b.bourbonId);
      }
    }
  }
  if (!missing.size) {
    return { scanned: snap.size, updated: 0, bottlesRead: 0 };
  }

  const ids = [...missing];
  const refs = ids.map((id) => db.collection("bourbons").doc(id));
  const found = new Map<string, FlavorTags>();
  for (let i = 0; i < refs.length; i += GET_ALL_CHUNK) {
    const docs = await db.getAll(...refs.slice(i, i + GET_ALL_CHUNK));
    for (const doc of docs) {
      const tags = profileToTags(doc.get("flavorProfile"));
      if (hasTags(tags)) {
        found.set(doc.id, tags);
      }
    }
  }

  let updated = 0;
  for (const doc of snap.docs) {
    const bottles = (doc.get("mentionedBottles") as MentionedBottle[]) ?? [];
    let changed = false;
    const next = bottles.map((b) => {
      const tags = b.bourbonId && !hasTags(b.flavor) ? found.get(b.bourbonId) : undefined;
      if (!tags) {
        return b;
      }
      changed = true;
      return { ...b, flavor: tags };
    });
    if (changed) {
      await doc.ref.update({ mentionedBottles: next });
      updated++;
    }
  }
  return { scanned: snap.size, updated, bottlesRead: ids.length };
}

/**
 * Scans the most-recently-fetched articles and extracts bottles for any that
 * lack `bottlesExtractedAt`, pacing calls and stopping early on a rate limit.
 */
async function sweepUnprocessed(
  db: FirebaseFirestore.Firestore,
  apiKey: string,
  limit: number,
  opts: { force?: boolean; sinceMs?: number } = {}
): Promise<{
  scanned: number;
  processed: number;
  skipped: number;
  rateLimited: boolean;
}> {
  let query: FirebaseFirestore.Query = db
    .collection("newsArticles")
    .orderBy("fetchedAt", "desc");
  if (opts.sinceMs) {
    query = query.where("fetchedAt", ">=", Timestamp.fromMillis(opts.sinceMs));
  }
  const snap = await query.limit(limit).get();

  let processed = 0;
  let skipped = 0;
  let rateLimited = false;
  for (const doc of snap.docs) {
    const data = doc.data();
    // Skip only articles extracted with the CURRENT prompt version (BB-219):
    // a version bump re-extracts old ones gradually, paced like a backfill.
    // Pre-versioning docs count as v1. Safe to re-run: mentionedBottles is
    // rebuilt, flavor seeding merges, and fact backfill is null-only.
    const version =
      typeof data.extractionVersion === "number" ? data.extractionVersion : 1;
    if (
      !opts.force &&
      data.bottlesExtractedAt &&
      version >= EXTRACTION_PROMPT_VERSION
    ) {
      skipped++;
      continue; // already extracted (force re-extracts anyway)
    }
    const n = await processArticle(db, doc.ref, data, apiKey);
    if (n === RATE_LIMITED) {
      rateLimited = true;
      break; // stop hammering a limited quota; unprocessed docs stay for later
    }
    if (n >= 0) {
      processed++;
    } else {
      skipped++;
    }
    await sleep(BACKFILL_SPACING_MS);
  }
  return { scanned: snap.size, processed, skipped, rateLimited };
}

/**
 * Extracts, catalog-matches, and caches bottles for one article. Returns the
 * number written (>= 0), RATE_LIMITED when throttled (left for a later retry),
 * or -1 on other failure (best-effort: never throws — no retry storms / cost).
 */
async function processArticle(
  db: FirebaseFirestore.Firestore,
  ref: FirebaseFirestore.DocumentReference,
  article: FirebaseFirestore.DocumentData | undefined,
  apiKey: string
): Promise<number> {
  if (!article) {
    return -1;
  }
  const headline = (article.headline as string) ?? "";
  const excerpt = (article.excerpt as string) ?? "";
  const storedBody = (article.bodyText as string) ?? "";
  const url = (article.url as string) ?? "";

  // Prefer the full body from the feed; if it's only a teaser (or absent),
  // fetch the article URL and extract the body. Fall back to the excerpt so an
  // extraction never runs on nothing. This is why the model missed bottles
  // named deep in an article: it only ever saw the ~320-char teaser (BB-130).
  let body = storedBody;
  if (body.length < MIN_BODY_CHARS && url) {
    const fetched = await fetchArticleBody(url);
    if (fetched.length > body.length) {
      body = fetched;
    }
  }
  if (body.length < excerpt.length) {
    body = excerpt;
  }

  const text = buildModelText(headline, body, MAX_TEXT_CHARS);
  if (text.length < 12) {
    return 0;
  }

  let extracted: ExtractedBottle[];
  let articleType: string;
  try {
    ({ articleType, bottles: extracted } = await extractBottleNames(text, apiKey));
  } catch (err) {
    if (err instanceof RateLimitError) {
      return RATE_LIMITED; // caller decides whether to stop / retry later
    }
    logger.warn(`Bottle extraction failed for ${ref.id}`, err);
    return -1;
  }

  const seen = new Set<string>();
  const bottles: MentionedBottle[] = [];
  for (const raw of extracted) {
    const name = raw.name.trim();
    const key = normalizeBottleName(name);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    // Category + whiskey-only validation already happened in
    // parseExtractionResponse (BB-195).
    const category = raw.category;
    const distillery = raw.distillery?.trim() || null;
    const match = await matchOrCreateCatalog(db, key, name, distillery, category, raw);
    // Feed (a), BB-185: seed the bottle's catalog flavor profile from any
    // tasting notes in the article. Best-effort — never fail extraction for it.
    // Seeded before the chip is built so a bottle first created here still
    // carries flavor tags for the Taste Match badge (BB-199).
    // Press releases seed ONLY the marketing tier (BB-222): their notes are
    // recorded as producer claims, never merged into the profile arrays.
    let seeded: FlavorTags | null = null;
    try {
      seeded = await seedArticleFlavor(
        db,
        match.id,
        raw.flavor,
        ref.id,
        articleType !== "press_release"
      );
    } catch (err) {
      logger.warn(`Flavor seed failed for ${match.id}`, err);
    }
    // A verdict (BB-220) or a printed score (BB-221) is a critic signal — cache
    // it on the catalog doc. parseRating verifies the raw score verbatim against
    // the same article text the extraction read, then normalizes it to 0-100
    // (unrecognized scale → null). Best-effort like the flavor seed; keyed by
    // articleId so re-runs are safe.
    const score = raw.rating ? parseRating(raw.rating, text) : null;
    if (raw.verdict || score != null) {
      try {
        await recordCriticSignal(db, match.id, ref.id, {
          verdict: raw.verdict,
          score,
          sourceName: (article.sourceName as string) ?? "",
        });
      } catch (err) {
        logger.warn(`Critic signal failed for ${match.id}`, err);
      }
    }
    bottles.push({
      name,
      bourbonId: match.id,
      distillery,
      category,
      flavor: seeded ?? match.flavorTags,
      verdict: raw.verdict,
    });
    if (bottles.length >= MAX_BOTTLES) {
      break;
    }
  }

  await ref.update({
    mentionedBottles: bottles,
    bottlesExtractedAt: FieldValue.serverTimestamp(),
    extractionVersion: EXTRACTION_PROMPT_VERSION,
    articleType,
  });
  return bottles.length;
}

/**
 * Upserts one article's opinion of a bottle into the catalog's `criticSignals`
 * map (BB-220). Read-modify-write is fine here: verdicts are rare (reviews
 * only) and the map is tiny; `upsertCriticSignal` caps it and keeps an
 * existing BB-221 score when re-runs carry none.
 */
async function recordCriticSignal(
  db: FirebaseFirestore.Firestore,
  bourbonId: string,
  articleId: string,
  signal: { verdict: string | null; score: number | null; sourceName: string }
): Promise<void> {
  const ref = db.collection("bourbons").doc(bourbonId);
  const snap = await ref.get();
  const existing =
    (snap.get("criticSignals") as Parameters<typeof upsertCriticSignal>[0]) ?? {};
  // A score-less re-extraction keeps any score already on file (upsertCriticSignal
  // handles that); a verdict-less signal (score but no opinion) is still valid.
  const next = upsertCriticSignal(existing, articleId, {
    score: signal.score,
    verdict: signal.verdict,
    sourceName: signal.sourceName,
    at: Timestamp.now(),
  });
  await ref.update({ criticSignals: next });
}

/**
 * Null-only backfill of article-stated facts onto a matched catalog doc
 * (BB-219): an article may fill a blank, but never overwrites an existing
 * value — human/admin edits always win. `isNas: true` is a human statement
 * that the bottle has no age, so ageStatement is skipped in that case.
 */
async function backfillCatalogFacts(
  doc: FirebaseFirestore.QueryDocumentSnapshot,
  facts: ExtractedBottle
): Promise<void> {
  const patch: Record<string, number | string> = {};
  if (facts.proof != null && doc.get("proof") == null) {
    patch.proof = facts.proof;
  }
  if (
    facts.ageYears != null &&
    doc.get("ageStatement") == null &&
    doc.get("isNas") !== true
  ) {
    patch.ageStatement = facts.ageYears;
  }
  if (facts.msrp != null && doc.get("msrp") == null) {
    patch.msrp = facts.msrp;
  }
  if (facts.releaseType != null && doc.get("releaseType") == null) {
    patch.releaseType = facts.releaseType;
  }
  if (Object.keys(patch).length > 0) {
    await doc.ref.update(patch);
  }
}

/**
 * Finds (or creates) the catalog entry for a normalized name. Returns the id
 * plus the matched doc's flavor tags (BB-199): they're denormalized onto the
 * article's `mentionedBottles` so feed chips can show the Taste Match badge
 * without per-chip reads. Freshly created bottles have no profile yet.
 */
async function matchOrCreateCatalog(
  db: FirebaseFirestore.Firestore,
  key: string,
  name: string,
  distillery: string | null,
  category: string | null,
  facts: ExtractedBottle
): Promise<{ id: string; flavorTags: ReturnType<typeof profileToTags> | null }> {
  const fromDoc = async (
    doc: FirebaseFirestore.QueryDocumentSnapshot
  ): Promise<{ id: string; flavorTags: ReturnType<typeof profileToTags> | null }> => {
    // Article-stated facts fill blanks on the matched entry (BB-219).
    await backfillCatalogFacts(doc, facts);
    const tags = profileToTags(doc.get("flavorProfile"));
    const hasAny = tags.nose.length + tags.palate.length + tags.finish.length > 0;
    return { id: doc.id, flavorTags: hasAny ? tags : null };
  };

  // Match an existing catalog entry (same order the client findOrCreate uses).
  const byName = await db
    .collection("bourbons")
    .where("nameNormalized", "==", key)
    .limit(1)
    .get();
  if (!byName.empty) {
    return fromDoc(byName.docs[0]);
  }
  const byAlias = await db
    .collection("bourbons")
    .where("aliases", "array-contains", key)
    .limit(1)
    .get();
  if (!byAlias.empty) {
    return fromDoc(byAlias.docs[0]);
  }
  const nameLowercase = name.toLowerCase();
  const byLower = await db
    .collection("bourbons")
    .where("nameLowercase", "==", nameLowercase)
    .limit(1)
    .get();
  if (!byLower.empty) {
    return fromDoc(byLower.docs[0]);
  }

  // No match — create the shared catalog entry from the AI-sourced fields so the
  // bottle has a bourbonId usable in autocomplete and cellar/hunt-list entries.
  const created = db.collection("bourbons").doc();
  await created.set({
    name,
    nameLowercase,
    nameNormalized: key,
    aliases: [],
    canonicalId: null,
    distillery: distillery ?? null,
    bottler: null,
    category: category ?? null,
    subType: null,
    ageStatement: facts.ageYears ?? null,
    isNas: false,
    proof: facts.proof ?? null,
    msrp: facts.msrp ?? null,
    releaseType: facts.releaseType ?? null,
    series: null,
    createdAt: FieldValue.serverTimestamp(),
    createdByUserId: "system:ai",
  });
  return { id: created.id, flavorTags: null };
}

/**
 * Merges an article's tasting notes into a catalog bottle's flavor profile
 * (BB-185 feed a) with trust-tiered provenance (BB-222). Evaluative articles
 * accumulate into the arrays + `tagCounts`; press releases record claims in
 * `marketingTagCounts` only. Idempotent per articleId, so the versioned
 * re-sweep never double-counts. Best-effort; returns the profile's array tags
 * (for the feed chip) or null when the bottle still has none.
 */
async function seedArticleFlavor(
  db: FirebaseFirestore.Firestore,
  bourbonId: string,
  rawFlavor: unknown,
  articleId: string,
  evaluative: boolean
): Promise<FlavorTags | null> {
  const seed = articleFlavorSeed(rawFlavor);
  if (!seed) {
    return null;
  }
  const ref = db.collection("bourbons").doc(bourbonId);
  const snap = await ref.get();
  const profile = snap.get("flavorProfile");
  const existing = profileToTags(profile);
  const prov = profileProvenance(profile);
  // AI-only profile (an AI guess with no article notes yet) → the first real
  // article seed REPLACES it, doesn't merge under it (BB-227). hasTags guards a
  // null/empty profile (nothing to replace). Community-only profiles also carry
  // no article notes, but they live in userTags (untouched by the arrays here).
  const aiOnly = hasTags(existing) && !hasArticleNotes(prov);
  const res = applyArticleSeed(existing, prov, seed, articleId, evaluative, aiOnly);
  if (!res.changed) {
    return hasTags(existing) ? existing : null; // nothing new — skip the write
  }
  // Carry the generation prompt version through (BB-196) — an article seed
  // augments a profile, it doesn't regenerate it, so the version must survive
  // or the force sweep would re-upgrade this bottle forever.
  const promptVersion = (profile as { promptVersion?: unknown } | undefined)
    ?.promptVersion;
  await ref.update({
    flavorProfile: {
      ...res.tags,
      ...res.provenance,
      source: "ai",
      model: EXTRACTION_MODEL,
      ...(promptVersion !== undefined ? { promptVersion } : {}),
      generatedAt: Timestamp.now(),
    },
    flavorEnrichedAt: FieldValue.serverTimestamp(),
  });
  return hasTags(res.tags) ? res.tags : null;
}

/**
 * The ONLY model-specific code. Calls the Gemini API (BB-226) with the
 * extraction responseSchema — constrained decoding guarantees parseable JSON,
 * while every judgment guard (isProductName, verbatim facts, verdict gating)
 * still runs in the parsers. Temp 0, hard output cap. Throws RateLimitError
 * on 429. An empty (e.g. safety-blocked) reply degrades to "no bottles" and
 * is cached, matching the old provider's behavior — no retry loops.
 */
async function extractBottleNames(
  text: string,
  apiKey: string
): Promise<{ articleType: string; bottles: ExtractedBottle[] }> {
  const content =
    (await generateText(apiKey, {
      model: EXTRACTION_MODEL,
      system: EXTRACTION_SYSTEM_PROMPT,
      user: `TEXT:\n${text}`,
      maxTokens: MAX_OUTPUT_TOKENS,
      // Not 0: greedy decoding occasionally looped on multi-bottle listicles,
      // emitting a giant repeating flavor array that blew the token budget and
      // truncated the JSON (BB-227). A small temperature breaks the loop while
      // keeping extraction effectively deterministic under the response schema.
      temperature: 0.15,
      responseSchema: EXTRACTION_RESPONSE_SCHEMA,
    })) || "{}";
  // The article text doubles as the verbatim-fact verifier (BB-219).
  return {
    articleType: parseArticleType(content),
    bottles: parseExtractionResponse(content, text),
  };
}
