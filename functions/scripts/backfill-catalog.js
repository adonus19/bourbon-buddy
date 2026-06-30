/**
 * One-time backfill (BB-160 pass 2): populate `nameNormalized`, `aliases`, and
 * `canonicalId` on existing /bourbons docs so the canonicalization in
 * BourbonCatalogService.findOrCreate matches against legacy entries.
 *
 * Run with Application Default Credentials:
 *   gcloud auth application-default login          # one-time
 *   GCLOUD_PROJECT=bourbonbuddy-dev node scripts/backfill-catalog.js
 *
 * Idempotent — only fills fields that are missing.
 */
const admin = require("firebase-admin");
const { normalizeBottleName } = require("./lib-normalize");

const projectId = process.env.GCLOUD_PROJECT || "bourbonbuddy-dev";
admin.initializeApp({ projectId });
const db = admin.firestore();

async function main() {
  const snap = await db.collection("bourbons").get();
  let updated = 0;
  let batch = db.batch();
  let ops = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    const patch = {};
    if (d.nameNormalized === undefined) {
      patch.nameNormalized = normalizeBottleName(d.name);
    }
    if (d.aliases === undefined) {
      patch.aliases = [];
    }
    if (d.canonicalId === undefined) {
      patch.canonicalId = null;
    }
    if (Object.keys(patch).length > 0) {
      batch.update(doc.ref, patch);
      updated++;
      ops++;
      if (ops >= 400) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }
  }
  if (ops > 0) {
    await batch.commit();
  }
  console.log(`Backfilled ${updated} of ${snap.size} catalog docs (project ${projectId}).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
