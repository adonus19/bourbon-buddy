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
 *    `mentionedBottles` arrays on recent newsArticles and from `similarBottles`
 *    neighbor lists, so nothing points at a dead catalog doc.
 *
 * Classification uses Groq (same free-tier model as extraction). Run with
 * Application Default Credentials:
 *   gcloud auth application-default login          # one-time
 *   GCLOUD_PROJECT=bourbonbuddy-dev GROQ_API_KEY=... \
 *     node scripts/cleanup-non-whiskey.js [--apply]
 */
const admin = require("firebase-admin");

const { collectReferencedIds, deleteAndScrub } = require("./lib-catalog");

const projectId = process.env.GCLOUD_PROJECT || "bourbonbuddy-dev";
admin.initializeApp({ projectId });
const db = admin.firestore();

const APPLY = process.argv.includes("--apply");
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = "llama-3.1-8b-instant";
const CLASSIFY_BATCH = 40;
const CALL_SPACING_MS = 3000; // free tier is 30 RPM; stay far under it

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function main() {
  if (!GROQ_API_KEY) {
    throw new Error("Set GROQ_API_KEY (same secret the functions use).");
  }

  const snap = await db
    .collection("bourbons")
    .where("createdByUserId", "==", "system:ai")
    .get();
  console.log(`${snap.size} AI-created catalog docs (project ${projectId}).`);

  const referenced = await collectReferencedIds(db);
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
  const { articles, neighbors } = await deleteAndScrub(db, toDelete);
  console.log(
    `\nDeleted ${toDelete.length} doc(s); scrubbed chips from ${articles} ` +
      `article(s) and neighbors from ${neighbors} catalog doc(s).`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
