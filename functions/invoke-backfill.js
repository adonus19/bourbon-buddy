#!/usr/bin/env node
/**
 * Operator invoke of the deployed `backfillArticleBottles` callable (admin-only).
 * Mints an ID token for the admin owner via ADC → custom token → Identity
 * Toolkit exchange, then POSTs to the callable. App Check is currently disabled
 * (ENFORCE_APP_CHECK=false) so no App Check token is needed.
 *
 * Run from functions/ (has firebase-admin):
 *   GCLOUD_PROJECT=bourbonbuddy-dev node <this> [limit] [sinceHours]
 */
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

const PROJECT = process.env.GCLOUD_PROJECT || "bourbonbuddy-dev";
const WEB_API_KEY = "AIzaSyAj423AeVQWgEJL92HQcwb_T8JC3yVOSpE";
const ADMIN_EMAIL = "daniel.j.pogue@gmail.com";
const CALLABLE_URL =
  `https://us-central1-${PROJECT}.cloudfunctions.net/backfillArticleBottles`;

const limit = Number(process.argv[2] || 5);
const sinceHours = Number(process.argv[3] || 48);
const force = process.argv[4] === "force";

async function main() {
  // Plain user-ADC can't sign JWTs locally; point the SDK's IAM signer at the
  // firebase-adminsdk SA (our ADC principal has signBlob on it) so
  // createCustomToken signs via the IAM credentials API.
  initializeApp({
    projectId: PROJECT,
    serviceAccountId: `firebase-adminsdk-fbsvc@${PROJECT}.iam.gserviceaccount.com`,
  });
  const auth = getAuth();

  const user = await auth.getUserByEmail(ADMIN_EMAIL);
  if (user.customClaims?.admin !== true) {
    throw new Error(
      `${ADMIN_EMAIL} lacks the admin claim — run scripts/set-admin-claim.js first.`
    );
  }
  console.log(`Admin user ${user.uid} (${user.email}) confirmed admin:true.`);

  // Custom token → ID token. Persisted custom claims (admin:true) ride along on
  // the exchanged ID token automatically, so nothing extra to inject here.
  const customToken = await auth.createCustomToken(user.uid);
  const exchange = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${WEB_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );
  const exBody = await exchange.json();
  if (!exchange.ok) {
    throw new Error(`Token exchange failed: ${JSON.stringify(exBody)}`);
  }
  const idToken = exBody.idToken;

  // force + sinceHours re-extracts recently-fetched articles so we actually
  // watch fresh calls flow through the new provider (idempotent by design).
  const payload = { data: { limit, ...(force ? { force: true, sinceHours } : {}) } };
  console.log(`Calling backfillArticleBottles ${JSON.stringify(payload.data)} ...`);
  const res = await fetch(CALLABLE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  console.log(`HTTP ${res.status}`);
  console.log(text);
  if (!res.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
