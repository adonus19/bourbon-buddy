/**
 * One-time migration (BB-161): copy existing wishlist-subcollection sightings
 * (`/users/{uid}/wishlistEntries/{entryId}/sightings/{id}`) into the new
 * first-class `/sightings` collection, carrying `bourbonId` from the parent
 * entry, `spotterUid = uid`, and `visibility = 'private'`.
 *
 * SAFE BY DEFAULT: dry run unless you pass --apply. Idempotent — each new doc
 * reuses the old sighting's id, so re-running overwrites rather than duplicates.
 * The old subcollection docs are LEFT IN PLACE (the app stops reading them);
 * delete them later once you've verified.
 *
 *   gcloud auth application-default login
 *   GCLOUD_PROJECT=bourbonbuddy-dev node scripts/migrate-sightings.js          # preview
 *   GCLOUD_PROJECT=bourbonbuddy-dev node scripts/migrate-sightings.js --apply  # apply
 */
const admin = require("firebase-admin");

const projectId = process.env.GCLOUD_PROJECT || "bourbonbuddy-dev";
const APPLY = process.argv.includes("--apply");

admin.initializeApp({ projectId });
const db = admin.firestore();

async function main() {
  // collectionGroup('sightings') matches BOTH the old subcollections and the
  // new top-level collection — filter to the old ones by path.
  const snap = await db.collectionGroup("sightings").get();
  let migrated = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    const path = doc.ref.path;
    if (!path.includes("/wishlistEntries/")) {
      continue; // already a top-level /sightings doc
    }

    const segments = path.split("/"); // users/{uid}/wishlistEntries/{entryId}/sightings/{id}
    const uid = segments[1];
    const entryRef = doc.ref.parent.parent; // the wishlistEntry doc
    if (!entryRef) {
      skipped++;
      continue;
    }
    const entrySnap = await entryRef.get();
    const entry = entrySnap.data();
    if (!entry || !entry.bourbonId) {
      console.warn(`skip ${path}: parent entry missing/has no bourbonId`);
      skipped++;
      continue;
    }

    const s = doc.data();
    const out = {
      bourbonId: entry.bourbonId,
      bourbonName: entry.bourbonName || null,
      spotterUid: uid,
      storeName: s.storeName,
      price: s.price,
      sightingDate: s.sightingDate,
      city: s.city ?? null,
      state: s.state ?? null,
      notes: s.notes ?? null,
      markedStaleManually: s.markedStaleManually ?? false,
      visibility: "private",
      createdAt: s.createdAt || admin.firestore.FieldValue.serverTimestamp(),
    };

    console.log(
      `${APPLY ? "[migrate]" : "[dry]"} ${path} -> sightings/${doc.id} ` +
        `(${out.bourbonName || out.bourbonId} @ $${out.price})`
    );
    if (APPLY) {
      await db.collection("sightings").doc(doc.id).set(out);
    }
    migrated++;
  }

  console.log(
    `${APPLY ? "" : "DRY RUN — "}Migrated ${migrated} sightings, skipped ${skipped}.`
  );
  if (!APPLY) {
    console.log("Re-run with --apply to write.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
