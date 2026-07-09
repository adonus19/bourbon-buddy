/**
 * One-time cleanup (BB-195): remove non-whiskey products (tequila, gin, beer,
 * …) that article extraction created in /bourbons before the whiskey-only
 * filter existed. Only AI-created docs (`createdByUserId == "system:ai"`) are
 * candidates; user-created entries were deliberate and are never touched.
 *
 * Safety rails:
 *  - DRY-RUN by default — prints what would happen; pass --apply to delete.
 *  - A candidate referenced by ANY user's logEntries/wishlistEntries or by a
 *    sighting is skipped and reported (someone chose it on purpose).
 *  - On --apply, deleted bottles are also scrubbed from the cached
 *    `mentionedBottles` arrays on recent newsArticles so the feed doesn't
 *    offer chips that point at dead catalog docs.
 *
 * Classification uses Groq (same free-tier model as extraction). Run with
 * Application Default Credentials:
 *   gcloud auth application-default login          # one-time
 *   GCLOUD_PROJECT=bourbonbuddy-dev GROQ_API_KEY=... \
 *     node scripts/cleanup-non-whiskey.js [--apply]
 */
const admin = require("firebase-admin");

const projectId = process.env.GCLOUD_PROJECT || "bourbonbuddy-dev";
admin.initializeApp({ projectId });
const db = admin.firestore();

const APPLY = process.argv.includes("--apply");
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = "llama-3.1-8b-instant";
const CLASSIFY_BATCH = 40;
const CALL_SPACING_MS = 3000; // free tier is 30 RPM; stay far under it
const ARTICLE_SCRUB_LIMIT = 1000; // newest articles checked for dead chips

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Every bourbonId referenced by any log entry, wishlist entry, or sighting. */
async function collectReferencedIds() {
  const referenced = new Set();
  const users = await db.collection("users").select().get();
  for (const user of users.docs) {
    for (const sub of ["logEntries", "wishlistEntries"]) {
      const entries = await user.ref.collection(sub).select("bourbonId").get();
      for (const doc of entries.docs) {
        const id = doc.get("bourbonId");
        if (id) referenced.add(id);
      }
    }
  }
  const sightings = await db.collection("sightings").select("bourbonId").get();
  for (const doc of sightings.docs) {
    const id = doc.get("bourbonId");
    if (id) referenced.add(id);
  }
  return referenced;
}

/**
 * Asks the model which of the numbered product names are NOT whiskey.
 * Returns a Set of indices into `names`.
 */
async function classifyNonWhiskey(names) {
  const numbered = names.map((n, i) => `${i}: ${n}`).join("\n");
  const system =
    "You classify drink product names. Given a numbered list, reply ONLY " +
    'with JSON: {"non_whiskey": [numbers]} listing every product that is NOT ' +
    "a whiskey (bourbon, rye, wheat whiskey, Tennessee, American single malt, " +
    "scotch, Irish, Japanese, or other world whiskies all COUNT as whiskey). " +
    "Non-whiskey examples: tequila, mezcal, gin, vodka, rum, brandy, cognac, " +
    "liqueurs, canned cocktails, beer, cider, wine, hard seltzer. If a name " +
    "is ambiguous, treat it as whiskey (do NOT list it).";

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0,
      max_tokens: 512,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: numbered },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`Groq ${res.status}: ${await res.text()} — rerun later.`);
  }
  const body = await res.json();
  const parsed = JSON.parse(body.choices?.[0]?.message?.content ?? "{}");
  const indices = Array.isArray(parsed.non_whiskey) ? parsed.non_whiskey : [];
  return new Set(
    indices.filter((i) => Number.isInteger(i) && i >= 0 && i < names.length)
  );
}

/** Removes deleted bottles from cached mentionedBottles on recent articles. */
async function scrubArticles(deletedIds) {
  const articles = await db
    .collection("newsArticles")
    .orderBy("fetchedAt", "desc")
    .limit(ARTICLE_SCRUB_LIMIT)
    .get();
  let scrubbed = 0;
  let batch = db.batch();
  let ops = 0;
  for (const doc of articles.docs) {
    const bottles = doc.get("mentionedBottles");
    if (!Array.isArray(bottles) || bottles.length === 0) continue;
    const kept = bottles.filter((b) => !deletedIds.has(b?.bourbonId));
    if (kept.length === bottles.length) continue;
    batch.update(doc.ref, { mentionedBottles: kept });
    scrubbed++;
    ops++;
    if (ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
  return scrubbed;
}

async function main() {
  if (!GROQ_API_KEY) {
    throw new Error("Set GROQ_API_KEY (same secret the functions use).");
  }

  const snap = await db
    .collection("bourbons")
    .where("createdByUserId", "==", "system:ai")
    .get();
  console.log(`${snap.size} AI-created catalog docs (project ${projectId}).`);

  const referenced = await collectReferencedIds();
  const candidates = snap.docs.filter((d) => !referenced.has(d.id));
  const protected_ = snap.docs.filter((d) => referenced.has(d.id));
  for (const doc of protected_) {
    console.log(`  SKIP (referenced by a user): ${doc.get("name")}`);
  }

  const toDelete = [];
  for (let i = 0; i < candidates.length; i += CLASSIFY_BATCH) {
    const batch = candidates.slice(i, i + CLASSIFY_BATCH);
    const nonWhiskey = await classifyNonWhiskey(batch.map((d) => d.get("name")));
    for (const idx of nonWhiskey) {
      toDelete.push(batch[idx]);
    }
    if (i + CLASSIFY_BATCH < candidates.length) await sleep(CALL_SPACING_MS);
  }

  console.log(`\n${toDelete.length} non-whiskey doc(s) identified:`);
  for (const doc of toDelete) {
    console.log(`  ${APPLY ? "DELETE" : "would delete"}: ${doc.get("name")}`);
  }

  if (!APPLY) {
    console.log("\nDry run — rerun with --apply to delete.");
    return;
  }
  let batch = db.batch();
  let ops = 0;
  for (const doc of toDelete) {
    batch.delete(doc.ref);
    ops++;
    if (ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();

  const deletedIds = new Set(toDelete.map((d) => d.id));
  const scrubbed = await scrubArticles(deletedIds);
  console.log(
    `\nDeleted ${toDelete.length} doc(s); scrubbed chips from ${scrubbed} article(s).`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
