/**
 * One-time merge (BB-160 pass 2): finds /bourbons docs that share a normalized
 * name and merges each group into one canonical entry — folding the others'
 * names into `aliases`, tombstoning them with `canonicalId`, and repointing
 * every reference (logEntries, wishlistEntries, sightings across all users)
 * from the duplicate id to the canonical id.
 *
 * SAFE BY DEFAULT: runs as a dry run and only reports. Add --apply to write.
 *
 *   gcloud auth application-default login                                   # one-time
 *   GCLOUD_PROJECT=bourbonbuddy-dev node scripts/merge-catalog-duplicates.js          # dry run
 *   GCLOUD_PROJECT=bourbonbuddy-dev node scripts/merge-catalog-duplicates.js --apply  # apply
 *
 * Run backfill-catalog.js first so every doc has `nameNormalized`.
 *
 * Note: repointing uses collection-group queries on `bourbonId`. If Firestore
 * asks for an index, follow the link it prints (a single-field collection-group
 * index on bourbonId), then re-run.
 */
const admin = require("firebase-admin");
const { normalizeBottleName } = require("./lib-normalize");

const projectId = process.env.GCLOUD_PROJECT || "bourbonbuddy-dev";
const APPLY = process.argv.includes("--apply");
const REF_COLLECTIONS = ["logEntries", "wishlistEntries", "sightings"];

admin.initializeApp({ projectId });
const db = admin.firestore();

async function repointReferences(dupId, canonicalId) {
  let count = 0;
  for (const group of REF_COLLECTIONS) {
    const snap = await db
      .collectionGroup(group)
      .where("bourbonId", "==", dupId)
      .get();
    let batch = db.batch();
    let ops = 0;
    for (const doc of snap.docs) {
      count++;
      if (APPLY) {
        batch.update(doc.ref, { bourbonId: canonicalId });
        ops++;
        if (ops >= 400) {
          await batch.commit();
          batch = db.batch();
          ops = 0;
        }
      }
    }
    if (APPLY && ops > 0) {
      await batch.commit();
    }
  }
  return count;
}

function createdMillis(d) {
  return d.createdAt && d.createdAt.toMillis ? d.createdAt.toMillis() : 0;
}

async function main() {
  const snap = await db.collection("bourbons").get();

  const groups = new Map();
  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.canonicalId) {
      continue; // already merged away
    }
    const key = d.nameNormalized || normalizeBottleName(d.name);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push({ id: doc.id, ref: doc.ref, data: d });
  }

  let mergedGroups = 0;
  let mergedDocs = 0;
  let repointed = 0;

  for (const docs of groups.values()) {
    if (docs.length < 2) {
      continue;
    }
    docs.sort((a, b) => createdMillis(a.data) - createdMillis(b.data));
    const canonical = docs[0];
    const dups = docs.slice(1);
    mergedGroups++;

    const aliases = new Set(canonical.data.aliases || []);
    for (const dup of dups) {
      aliases.add(dup.data.nameNormalized || normalizeBottleName(dup.data.name));
      const refs = await repointReferences(dup.id, canonical.id);
      repointed += refs;
      mergedDocs++;
      console.log(
        `${APPLY ? "[merge]" : "[dry]"} "${dup.data.name}" (${dup.id}) -> ` +
          `"${canonical.data.name}" (${canonical.id}); ${refs} refs`
      );
      if (APPLY) {
        await dup.ref.update({ canonicalId: canonical.id });
      }
    }
    if (APPLY) {
      await canonical.ref.update({ aliases: Array.from(aliases) });
    }
  }

  console.log(
    `${APPLY ? "" : "DRY RUN — "}Merged ${mergedDocs} duplicates across ` +
      `${mergedGroups} groups; repointed ${repointed} references.`
  );
  if (!APPLY) {
    console.log("Re-run with --apply to make these changes.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
