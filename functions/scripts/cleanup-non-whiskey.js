/**
 * One-time cleanup (BB-195): remove non-whiskey products (tequila, gin, beer,
 * …) that article extraction created in /bourbons before the whiskey-only
 * filter existed. Only AI-created docs (`createdByUserId == "system:ai"`) are
 * candidates; user-created entries were deliberate and are never touched.
 *
 * THE CLASSIFIER IS A SUGGESTION, NOT AN AUTHORITY. Even with the guards below
 * it has flagged real whiskeys (Pursuit United, The Hearach). Deletion is
 * irreversible, so there is deliberately NO path from a classifier run straight
 * to a delete — the only way to delete is a human-reviewed list.
 *
 * Three modes:
 *   1. Report — classify and print suggestions (default)
 *   2. Export — classify and write a reviewable file (--export=FILE)
 *   3. Delete — delete exactly the reviewed ids (--from-list=FILE --apply)
 *
 * Safety rails:
 *  - Mode 3 makes no model call at all; your reviewed file is the authority.
 *  - Ids are intersected with the eligible-candidate set every run, so a stale
 *    file can never delete a doc that has since been referenced or user-created.
 *  - A candidate referenced by ANY user's logEntries/wishlistEntries or by a
 *    sighting is skipped and reported (someone chose it on purpose).
 *  - A whiskey-sounding name is never flagged, and a second inverse-question
 *    pass rescues anything that is or might be a whiskey.
 *  - On delete, bottles are also scrubbed from the cached `mentionedBottles`
 *    arrays on newsArticles and from `similarBottles` neighbor lists, so
 *    nothing points at a dead catalog doc.
 *
 * Classification uses Groq. Run with Application Default Credentials:
 *   gcloud auth application-default login          # one-time
 *   GCLOUD_PROJECT=bourbonbuddy-dev GROQ_API_KEY=... \
 *     node scripts/cleanup-non-whiskey.js --export=candidates.txt
 *   # ...review the file by hand, deleting lines you want to KEEP...
 *   GCLOUD_PROJECT=bourbonbuddy-dev \
 *     node scripts/cleanup-non-whiskey.js --from-list=candidates.txt --apply
 */
const fs = require("fs");

const admin = require("firebase-admin");

const { collectReferencedIds, deleteAndScrub } = require("./lib-catalog");

const projectId = process.env.GCLOUD_PROJECT || "bourbonbuddy-dev";
admin.initializeApp({ projectId });
const db = admin.firestore();

const APPLY = process.argv.includes("--apply");
const flagValue = (name) => {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.slice(name.length + 3) : null;
};
const EXPORT = flagValue("export");
const FROM_LIST = flagValue("from-list");
const GROQ_API_KEY = process.env.GROQ_API_KEY;
// Classification is a one-time destructive decision, so use the strongest
// free-tier model — the 8b extraction model over-flags real whiskeys.
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
// Small batches. At 40 the model's recall collapsed: it flagged Belle Meade
// Bourbon Cask Strength Reserve, while the same 40 names in batches of 8 came
// back correct.
const CLASSIFY_BATCH = 10;
const CALL_SPACING_MS = 3000; // free tier is 30 RPM; stay far under it

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** One Groq JSON call. Returns the parsed object. */
async function askModel(system, user) {
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
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`Groq ${res.status}: ${await res.text()} — rerun later.`);
  }
  const body = await res.json();
  return JSON.parse(body.choices?.[0]?.message?.content ?? "{}");
}

/**
 * Resolves names the model echoed back to docs in the batch.
 *
 * Both passes ask the model to copy NAMES, never list indices. An earlier
 * version numbered the list and asked for indices; over a 40-name batch the
 * model quietly lost alignment and returned indices pointing at real whiskeys
 * (Maker's Mark, Belle Meade Bourbon), which this script would then have
 * deleted. Exact-string matching makes a misalignment impossible: a name that
 * doesn't match is reported and ignored rather than condemning some innocent
 * neighbor.
 */
function resolveNames(docs, returned) {
  const byName = new Map();
  docs.forEach((d, i) => {
    const name = d.get("name");
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(i);
  });
  const indices = new Set();
  for (const name of Array.isArray(returned) ? returned : []) {
    const hits = byName.get(name);
    if (!hits) {
      console.warn(`  WARN: model returned an unknown name, ignoring: ${name}`);
      continue;
    }
    hits.forEach((i) => indices.add(i));
  }
  return indices;
}

/**
 * Asks the model which products are NOT whiskey. Each line carries the doc's
 * distillery/category when known so the model isn't guessing from a bare name.
 * Returns a Set of indices into `docs`.
 */
async function classifyNonWhiskey(docs) {
  const listed = docs
    .map((d) => {
      const parts = [d.get("name")];
      if (d.get("distillery")) parts.push(`distillery: ${d.get("distillery")}`);
      if (d.get("category")) parts.push(`category: ${d.get("category")}`);
      return `- ${parts.join(" | ")}`;
    })
    .join("\n");
  const system =
    "You classify drink products. Given a list (name, sometimes distillery/" +
    'category), reply ONLY with JSON: {"non_whiskey": [names]} — copy the NAME ' +
    "field EXACTLY as given, listing every product you are CERTAIN is not a " +
    "whiskey (bourbon, rye, wheat whiskey, Tennessee, American single malt, " +
    "scotch, Irish, Japanese, and world whiskies all COUNT as whiskey). " +
    "Non-whiskey examples: tequila, mezcal, gin, vodka, rum, brandy, cognac, " +
    "sherry, shochu, liqueurs, canned cocktails, beer, cider, wine, hard " +
    "seltzer, soda. If a name is ambiguous or you do not recognize it, treat " +
    "it as whiskey (do NOT list it) — false deletions are far worse than " +
    "leftovers.";
  const parsed = await askModel(system, listed);
  return resolveNames(docs, parsed.non_whiskey);
}

// A name that says it's whiskey is never deleted, whatever the model thinks.
const WHISKEY_WORDS = /whisk(e)?y|bourbon|\brye\b|scotch|single malt/i;

/**
 * Second opinion on the flagged docs only: asks the model the INVERSE
 * question and rescues anything that is or might be a whiskey. One pass
 * over-flags real bottles (Johnnie Walker 18 was on the first list), and a
 * focused re-check catches those.
 */
async function rescueWhiskeys(docs) {
  if (docs.length === 0) return new Set();
  const listed = docs.map((d) => `- ${d.get("name")}`).join("\n");
  const system =
    "These drink products were flagged for deletion as non-whiskey. Reply " +
    'ONLY with JSON: {"whiskey": [names]} — copy each name EXACTLY as given — ' +
    "listing every product that IS or MIGHT BE a whiskey of any style " +
    "(bourbon, rye, scotch, Irish, Japanese, Tennessee, single malt, world " +
    "whisky). When in doubt, include it.";
  const parsed = await askModel(system, listed);
  return resolveNames(docs, parsed.whiskey);
}

/** Unreferenced, AI-created catalog docs — the only docs any mode may touch. */
async function loadCandidates() {
  const snap = await db
    .collection("bourbons")
    .where("createdByUserId", "==", "system:ai")
    .get();
  console.log(`${snap.size} AI-created catalog docs (project ${projectId}).`);
  const referenced = await collectReferencedIds(db);
  return {
    candidates: snap.docs.filter((d) => !referenced.has(d.id)),
    protected_: snap.docs.filter((d) => referenced.has(d.id)),
  };
}

/** Classify every candidate, then run both rescue passes over what was flagged. */
async function suggestDeletions(candidates) {
  if (!GROQ_API_KEY) {
    throw new Error("Set GROQ_API_KEY (same secret the functions use).");
  }
  const flagged = [];
  for (let i = 0; i < candidates.length; i += CLASSIFY_BATCH) {
    const batch = candidates.slice(i, i + CLASSIFY_BATCH);
    const nonWhiskey = await classifyNonWhiskey(batch);
    for (const idx of nonWhiskey) {
      flagged.push(batch[idx]);
    }
    if (i + CLASSIFY_BATCH < candidates.length) await sleep(CALL_SPACING_MS);
  }

  // Safety nets: a whiskey-sounding name is never deleted, and the model
  // re-examines the rest with the inverse question before anything goes.
  const suggested = [];
  const check = [];
  for (const doc of flagged) {
    if (WHISKEY_WORDS.test(doc.get("name") ?? "")) {
      console.log(`  RESCUE (name says whiskey): ${doc.get("name")}`);
    } else {
      check.push(doc);
    }
  }
  for (let i = 0; i < check.length; i += CLASSIFY_BATCH) {
    const batch = check.slice(i, i + CLASSIFY_BATCH);
    await sleep(CALL_SPACING_MS);
    const rescued = await rescueWhiskeys(batch);
    batch.forEach((doc, idx) => {
      if (rescued.has(idx)) {
        console.log(`  RESCUE (second opinion): ${doc.get("name")}`);
      } else {
        suggested.push(doc);
      }
    });
  }
  return suggested;
}

/**
 * Writes the classifier's suggestions to a reviewable file. The model's recall
 * is not good enough to delete on, even after the rescue passes — export,
 * review by hand, then `--from-list` is the only path to an actual delete.
 */
function writeReviewFile(path, suggested) {
  const today = new Date().toISOString().slice(0, 10);
  const lines = [
    `# Non-whiskey deletion candidates — ${projectId} — ${today}`,
    "#",
    "# DELETE A LINE TO KEEP THAT BOTTLE. Every line left in this file will be",
    "# deleted (along with its news-feed chips and similar-bottle references).",
    "# Blank lines and #-comments are ignored. Only the leading doc id matters.",
    "#",
    "# Suggested by an LLM and NOT trustworthy on its own — it has flagged real",
    "# whiskeys before. Read every line.",
    "#",
    `# ${suggested.length} candidate(s). Then:`,
    `#   node scripts/cleanup-non-whiskey.js --from-list=${path} --apply`,
    "",
  ];
  for (const doc of suggested) {
    const meta = [
      doc.get("distillery") || "no distillery",
      doc.get("category") || "no category",
      doc.get("flavorProfile") ? "has flavor profile" : "no flavor profile",
    ].join(" | ");
    lines.push(`${doc.id}  ${doc.get("name")}\n#     ↳ ${meta}`);
  }
  fs.writeFileSync(path, lines.join("\n") + "\n");
  console.log(`\nWrote ${suggested.length} candidate(s) to ${path}`);
  console.log("Review it, delete the lines you want to KEEP, then re-run with");
  console.log(`  node scripts/cleanup-non-whiskey.js --from-list=${path} --apply`);
}

/** Doc ids from a reviewed file: first token of each non-comment line. */
function readReviewFile(path) {
  return fs
    .readFileSync(path, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split(/\s+/)[0]);
}

/** Mode 3: delete exactly the reviewed ids. No model call. */
async function deleteFromList(candidates) {
  const approved = new Set(readReviewFile(FROM_LIST));
  const byId = new Map(candidates.map((d) => [d.id, d]));
  const toDelete = [];
  for (const id of approved) {
    const doc = byId.get(id);
    if (!doc) {
      console.warn(`  WARN: id not an eligible candidate, skipping: ${id}`);
      continue;
    }
    toDelete.push(doc);
  }
  console.log(`\n${toDelete.length} approved doc(s) from ${FROM_LIST}:`);
  for (const doc of toDelete) {
    console.log(`  ${APPLY ? "DELETE" : "would delete"}: ${doc.get("name")}`);
  }
  if (!APPLY) {
    console.log("\nDry run — add --apply to delete.");
    return;
  }
  const { articles, neighbors } = await deleteAndScrub(db, toDelete);
  console.log(
    `\nDeleted ${toDelete.length} doc(s); scrubbed chips from ${articles} ` +
      `article(s) and neighbors from ${neighbors} catalog doc(s).`
  );
}

async function main() {
  const { candidates, protected_ } = await loadCandidates();
  for (const doc of protected_) {
    console.log(`  SKIP (referenced by a user): ${doc.get("name")}`);
  }

  if (FROM_LIST) {
    await deleteFromList(candidates);
    return;
  }

  const suggested = await suggestDeletions(candidates);
  if (EXPORT) {
    writeReviewFile(EXPORT, suggested);
    return;
  }
  console.log(`\n${suggested.length} non-whiskey doc(s) suggested:`);
  for (const doc of suggested) {
    console.log(`  would delete: ${doc.get("name")}`);
  }
  console.log(
    "\nSuggestions only. Deleting straight from a classifier run is unsafe —" +
      "\nexport them for review instead:" +
      "\n  node scripts/cleanup-non-whiskey.js --export=candidates.txt"
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
