#!/usr/bin/env node
/**
 * Grant (or revoke) the `admin` custom claim that gates operator callables
 * (backfillArticleBottles, backfillFlavorEnrichment — BB-190).
 *
 * Usage (from functions/, after `npm run build` is NOT required):
 *   GOOGLE_APPLICATION_CREDENTIALS=... node scripts/set-admin-claim.js <uid-or-email> [--revoke]
 * or with application-default credentials:
 *   gcloud auth application-default login
 *   node scripts/set-admin-claim.js daniel.j.pogue@gmail.com
 *
 * The claim lands on the ID token at the NEXT sign-in / token refresh (~1 h).
 */
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

async function main() {
  const [target, flag] = process.argv.slice(2);
  if (!target) {
    console.error("Usage: node scripts/set-admin-claim.js <uid-or-email> [--revoke]");
    process.exit(1);
  }
  const revoke = flag === "--revoke";

  initializeApp();
  const auth = getAuth();
  const user = target.includes("@")
    ? await auth.getUserByEmail(target)
    : await auth.getUser(target);

  await auth.setCustomUserClaims(user.uid, {
    ...(user.customClaims ?? {}),
    admin: revoke ? undefined : true,
  });
  console.log(
    `${revoke ? "Revoked" : "Granted"} admin claim for ${user.uid} (${user.email ?? "no email"}).`
  );
  console.log("Takes effect on the user's next token refresh (or re-sign-in).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
