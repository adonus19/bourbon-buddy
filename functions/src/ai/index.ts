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

import { normalizeBottleName } from "../shared/normalize";

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

// Free-tier-eligible, fast, cheap. Swap here if the free tier changes.
const GEMINI_MODEL = "gemini-2.0-flash";
const MAX_BOTTLES = 8;
const MAX_TEXT_CHARS = 1500;

interface MentionedBottle {
  name: string;
  bourbonId: string | null;
}

export const extractBottlesFromArticle = onDocumentCreated(
  {
    document: "newsArticles/{articleId}",
    region: "us-central1",
    secrets: [GEMINI_API_KEY],
  },
  async (event) => {
    const article = event.data?.data();
    if (!article) {
      return;
    }
    const headline = (article.headline as string) ?? "";
    const excerpt = (article.excerpt as string) ?? "";
    const text = `${headline}\n${excerpt}`.trim().slice(0, MAX_TEXT_CHARS);
    if (text.length < 12) {
      return; // nothing worth a model call
    }

    let names: string[];
    try {
      names = await extractBottleNames(text, GEMINI_API_KEY.value());
    } catch (err) {
      // Extraction is best-effort: on failure the article just shows without
      // bottle chips. We don't throw (no retry storms / runaway cost).
      logger.warn(`Bottle extraction failed for ${event.params.articleId}`, err);
      return;
    }
    if (!names.length) {
      return;
    }

    const db = getFirestore();
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

    await event.data!.ref.update({
      mentionedBottles: bottles,
      bottlesExtractedAt: FieldValue.serverTimestamp(),
    });
    logger.info(
      `Extracted ${bottles.length} bottle(s) for ${event.params.articleId}.`
    );
  }
);

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
