#!/usr/bin/env node
/**
 * Gated access rollout (BB-210), step 2 of 4: stamp every EXISTING Auth user
 * with the `approved: true` custom claim and `accessStatus: 'approved'` on
 * their profile doc. MUST run before the tightened firestore.rules deploy, or
 * every existing user — including the owner — loses access until approved.
 *
 * Claims are MERGED (setCustomUserClaims replaces the whole map, so a naive
 * write would strip the owner's `admin` claim). Idempotent: re-running is safe.
 *
 * Usage (from functions/):
 *   gcloud auth application-default login   # or GOOGLE_APPLICATION_CREDENTIALS
 *   node scripts/backfill-approved-claims.js [--dry-run]
 *
 * Claims land on each user's ID token at their next refresh (~1 h) or sign-in.
 */
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  initializeApp();
  const auth = getAuth();
  const db = getFirestore();

  let stamped = 0;
  let alreadyApproved = 0;
  let pageToken = undefined;

  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) {
      const claims = user.customClaims ?? {};
      const label = `${user.uid} (${user.email ?? "no email"})`;

      if (claims.approved === true) {
        alreadyApproved += 1;
      } else if (dryRun) {
        console.log(`[dry-run] would approve ${label}`);
      } else {
        await auth.setCustomUserClaims(user.uid, { ...claims, approved: true });
      }

      if (!dryRun) {
        // Merge so an existing profile keeps all its fields; also self-heals a
        // doc the claim already covered but a previous partial run missed.
        await db
          .doc(`users/${user.uid}`)
          .set({ accessStatus: "approved" }, { merge: true });
        stamped += 1;
        console.log(`approved ${label}`);
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);

  console.log(
    dryRun
      ? `Dry run complete. ${alreadyApproved} already had the claim.`
      : `Backfill complete: ${stamped} users stamped ` +
          `(${alreadyApproved} already had the claim; claims were merged, ` +
          "admin claims preserved)."
  );
  console.log("Safe to deploy the tightened rules once this has run.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
