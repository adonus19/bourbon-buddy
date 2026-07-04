/**
 * AI "Find Bottles" (BB-130).
 *
 * When a news article is written, extract the whiskey/bourbon product names it
 * mentions (via Gemini), match them to the shared catalog, and cache the result
 * ON THE ARTICLE. This runs ONCE per article, ever — never per user, per view,
 * or per refresh — so the cost is flat and tiny no matter how many people read
 * it. The client reads the cached `mentionedBottles` field; no per-user AI cost.
 *
 * The Gemini key is a Secret Manager secret (GEMINI_API_KEY), never in code.
 * Provider is intentionally isolated to `extractBottleNames` so switching models
 * or vendors later (BB-131) is a one-function change.
 */
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { normalizeBottleName } from "../shared/normalize";

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

// Free-tier-eligible, fast, cheap. Swap here if the free tier changes.
const GEMINI_MODEL = "gemini-2.0-flash";
const MAX_BOTTLES = 8;
const MAX_TEXT_CHARS = 1500;
const BACKFILL_DEFAULT = 20;
const BACKFILL_MAX = 50;

interface MentionedBottle {
  name: string;
  bourbonId: string | null;
}

/** Runs once per new article: extract → match → cache on the article doc. */
export const extractBottlesFromArticle = onDocumentCreated(
  {
    document: "newsArticles/{articleId}",
    region: "us-central1",
    secrets: [GEMINI_API_KEY],
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
    }
  }
);

/**
 * Bounded backfill / test tool: extract bottles for the most recent articles
 * that haven't been processed yet. Signed-in only and capped at 50 per call so
 * it can't run away on cost. (Lock down or remove before a public launch.)
 */
export const backfillArticleBottles = onCall(
  { region: "us-central1", secrets: [GEMINI_API_KEY] },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign in to run the backfill.");
    }
    const requested = Number((request.data as { limit?: number })?.limit);
    const limit = Math.min(
      Math.max(Number.isFinite(requested) ? requested : BACKFILL_DEFAULT, 1),
      BACKFILL_MAX
    );

    const db = getFirestore();
    const snap = await db
      .collection("newsArticles")
      .orderBy("fetchedAt", "desc")
      .limit(limit)
      .get();

    const key = GEMINI_API_KEY.value();
    let processed = 0;
    let skipped = 0;
    for (const doc of snap.docs) {
      const data = doc.data();
      if (data.bottlesExtractedAt) {
        skipped++;
        continue; // already extracted
      }
      const n = await processArticle(db, doc.ref, data, key);
      if (n >= 0) {
        processed++;
      } else {
        skipped++;
      }
    }
    logger.info(`Backfill: scanned ${snap.size}, processed ${processed}.`);
    return { scanned: snap.size, processed, skipped };
  }
);

/**
 * Extracts, catalog-matches, and caches bottles for one article. Returns the
 * number written (>= 0), or -1 when the model call failed (best-effort: the
 * caller treats a failure as skipped, never throws — no retry storms / cost).
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
  const text = `${headline}\n${excerpt}`.trim().slice(0, MAX_TEXT_CHARS);
  if (text.length < 12) {
    return 0;
  }

  let names: string[];
  try {
    names = await extractBottleNames(text, apiKey);
  } catch (err) {
    logger.warn(`Bottle extraction failed for ${ref.id}`, err);
    return -1;
  }

  const seen = new Set<string>();
  const bottles: MentionedBottle[] = [];
  for (const raw of names) {
    const name = raw.trim();
    const key = normalizeBottleName(name);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    bottles.push({ name, bourbonId: await matchCatalog(db, key) });
    if (bottles.length >= MAX_BOTTLES) {
      break;
    }
  }

  await ref.update({
    mentionedBottles: bottles,
    bottlesExtractedAt: FieldValue.serverTimestamp(),
  });
  return bottles.length;
}

/** Finds an existing catalog bottleId for a normalized name, or null. */
async function matchCatalog(
  db: FirebaseFirestore.Firestore,
  key: string
): Promise<string | null> {
  const byName = await db
    .collection("bourbons")
    .where("nameNormalized", "==", key)
    .limit(1)
    .get();
  if (!byName.empty) {
    return byName.docs[0].id;
  }
  const byAlias = await db
    .collection("bourbons")
    .where("aliases", "array-contains", key)
    .limit(1)
    .get();
  return byAlias.empty ? null : byAlias.docs[0].id;
}

/**
 * The ONLY model-specific code. Calls Gemini and returns a list of bottle
 * product names. Uses structured output (JSON array of strings) for robust
 * parsing, temperature 0, and a hard output cap.
 */
async function extractBottleNames(
  text: string,
  apiKey: string
): Promise<string[]> {
  const prompt =
    "Extract distinct whiskey/bourbon PRODUCT names actually mentioned as " +
    "products (specific releases, expressions, or bottlings) in the text below. " +
    "Include specific product names like \"Weller 12 Year\" or " +
    "\"E.H. Taylor Small Batch\". Exclude bare distillery/brand names not tied " +
    "to a product, generic terms (bourbon, rye), people, places, and events. " +
    "Use the name as written, trimmed, no duplicates.\n\n" +
    `TEXT:\n${text}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 512,
          responseMimeType: "application/json",
          responseSchema: { type: "ARRAY", items: { type: "STRING" } },
        },
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const raw = body.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter((v): v is string => typeof v === "string");
}
