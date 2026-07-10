/**
 * One-time cleanup (BB-201): remove catalog entries that were never real
 * bottles — descriptive phrases the extractor lifted out of article prose
 * ("award-winning bourbon", "small-batch expressions") and bare company names
 * ("Pursuit Spirits"). Each of these also picked up an AI-invented flavor
 * profile from the enrichment sweep, so they look convincing in the UI.
 *
 * Only AI-created docs (`createdByUserId == "system:ai"`) are candidates; a
 * user-created entry was deliberate and is never touched.
 *
 * Unlike cleanup-non-whiskey.js this needs NO model call: the same
 * `isProductName` predicate the extractor now filters on decides here too, so
 * the script's verdict and the live filter can never disagree. It imports the
 * compiled function rather than mirroring it — run `npm run build` first.
 *
 * Safety rails:
 *  - DRY-RUN by default — prints what would happen; pass --apply to delete.
 *  - A candidate referenced by ANY user's logEntries/wishlistEntries or by a
 *    sighting is skipped and reported (someone chose it on purpose).
 *  - On --apply, deleted bottles are scrubbed from cached `mentionedBottles`
 *    chips on news articles and from `similarBottles` neighbor lists.
 *
 * Run with Application Default Credentials, from `functions/`:
 *   gcloud auth application-default login          # one-time
 *   npm run build
 *   GCLOUD_PROJECT=bourbonbuddy-dev node scripts/cleanup-generic-names.js [--apply]
 */
const admin = require("firebase-admin");

const { isProductName } = require("../lib/ai/extraction");
const { collectReferencedIds, deleteAndScrub } = require("./lib-catalog");

const projectId = process.env.GCLOUD_PROJECT || "bourbonbuddy-dev";
admin.initializeApp({ projectId });
const db = admin.firestore();

const APPLY = process.argv.includes("--apply");

async function main() {
  const snap = await db
    .collection("bourbons")
    .where("createdByUserId", "==", "system:ai")
    .get();
  console.log(`${snap.size} AI-created catalog docs (project ${projectId}).`);

  const junk = snap.docs.filter((d) => !isProductName(String(d.get("name") ?? "")));
  if (junk.length === 0) {
    console.log("\nNothing to do — every AI-created name is a real product.");
    return;
  }

  const referenced = await collectReferencedIds(db);
  const toDelete = junk.filter((d) => !referenced.has(d.id));
  for (const doc of junk.filter((d) => referenced.has(d.id))) {
    console.log(`  SKIP (referenced by a user): ${doc.get("name")}`);
  }

  console.log(`\n${toDelete.length} non-product doc(s) identified:`);
  for (const doc of toDelete) {
    const hasProfile = !!doc.get("flavorProfile");
    console.log(
      `  ${APPLY ? "DELETE" : "would delete"}: ${doc.get("name")}` +
        (hasProfile ? "  (has an invented flavor profile)" : "")
    );
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
