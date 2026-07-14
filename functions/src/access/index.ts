/**
 * Gated access (BB-210): the app is shared with friends but invite-gated.
 *
 * Anyone can create an account; a new account has NO access until it holds the
 * `approved: true` custom claim (checked by Security Rules and every callable
 * via `requireApproved`). Two ways in:
 *
 *   1. Auto-approve — the signup email is on the owner-managed
 *      `/accessAllowlist` AND verified (Google sign-ins always are).
 *   2. Manual — the account lands `accessStatus: 'pending'`, the owner gets an
 *      `accessRequest` push (delivered regardless of prefs), and approves or
 *      denies from the /admin screen via the callables below.
 *
 * `users/{uid}.accessStatus` is the UI mirror of the claim ('pending' |
 * 'approved' | 'denied'); ONLY this module (Admin SDK) writes it — rules reject
 * owner writes. Deny is soft: status only, the Auth account stays enabled.
 *
 * ⚠ Rollout: scripts/backfill-approved-claims.js must stamp existing users
 * BEFORE the tightened rules deploy, or everyone (including the owner) goes dark.
 */
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { defineString } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as functionsV1 from "firebase-functions/v1";

import { sendNotificationToUser } from "../notifications";
import { ENFORCE_APP_CHECK, requireAdmin } from "../shared/guards";

/** The owner's uid — where new-signup access requests are pushed. */
const ACCESS_ADMIN_UID = defineString("ACCESS_ADMIN_UID", { default: "" });

/** The subset of the Auth user record the signup decision needs. */
export interface NewUserInfo {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
}

/**
 * Grants access: merges the `approved` claim (never replacing other claims,
 * e.g. the owner's `admin`), mirrors `accessStatus`, and upserts the email into
 * the allowlist so a deleted-and-recreated account self-heals. The claim lands
 * on the client at its next token refresh; the status flip is what the pending
 * screen reacts to.
 */
export async function approveAccess(uid: string): Promise<void> {
  const auth = getAuth();
  const db = getFirestore();
  const user = await auth.getUser(uid);

  await auth.setCustomUserClaims(uid, {
    ...(user.customClaims ?? {}),
    approved: true,
  });
  await db.doc(`users/${uid}`).set({ accessStatus: "approved" }, { merge: true });

  const emailLower = user.email?.toLowerCase();
  if (emailLower) {
    const ref = db.doc(`accessAllowlist/${emailLower}`);
    if (!(await ref.get()).exists) {
      await ref.set({
        note: user.displayName ?? null,
        addedAt: FieldValue.serverTimestamp(),
      });
    }
  }
}

/**
 * Revokes/denies access: strips the `approved` claim (a no-op for a pending
 * account, a revocation for a previously approved one) and marks the profile
 * denied. Soft on purpose — the Auth account is NOT disabled, so the decision
 * is reversible with a later approve. Throws if the owner targets themself.
 */
export async function denyAccess(uid: string, callerUid: string): Promise<void> {
  if (uid === callerUid) {
    throw new HttpsError(
      "invalid-argument",
      "You can't deny your own account."
    );
  }
  const auth = getAuth();
  const user = await auth.getUser(uid);
  const claims = { ...(user.customClaims ?? {}) };
  delete claims.approved;
  await auth.setCustomUserClaims(uid, claims);
  await getFirestore()
    .doc(`users/${uid}`)
    .set({ accessStatus: "denied" }, { merge: true });
}

/**
 * The signup decision. Auto-approve requires the allowlist hit AND a verified
 * email — otherwise anyone who guessed an allowlisted address could register
 * it with a password and walk in. An unverified allowlist match degrades to the
 * manual queue, with a hint in the owner's notification for a one-tap approve.
 */
export async function processNewUser(
  user: NewUserInfo,
  adminUid: string
): Promise<"approved" | "pending"> {
  const db = getFirestore();
  const emailLower = user.email?.toLowerCase() ?? null;
  const allowlisted = emailLower
    ? (await db.doc(`accessAllowlist/${emailLower}`).get()).exists
    : false;

  if (allowlisted && user.emailVerified) {
    await approveAccess(user.uid);
    logger.info(`Auto-approved ${user.uid} (${emailLower}) from allowlist.`);
    return "approved";
  }

  await db
    .doc(`users/${user.uid}`)
    .set({ accessStatus: "pending" }, { merge: true });

  if (!adminUid) {
    logger.warn(
      `ACCESS_ADMIN_UID is not set — ${user.uid} is pending with no one notified.`
    );
    return "pending";
  }

  const who = user.displayName
    ? `${user.displayName} (${user.email ?? "no email"})`
    : (user.email ?? user.uid);
  const hint =
    allowlisted && !user.emailVerified
      ? " They're on your allowlist, but the email isn't verified."
      : "";
  await sendNotificationToUser(
    adminUid,
    {
      title: "New access request",
      body: `${who} signed up and is waiting for approval.${hint}`,
      link: "/admin",
    },
    "accessRequest"
  );
  return "pending";
}

/**
 * Fires once per created Auth account, for every provider. v1 on purpose:
 * the v2 equivalent (blocking functions) requires the Identity Platform
 * upgrade, which this flow doesn't need.
 */
export const onAuthUserCreated = functionsV1.auth
  .user()
  .onCreate(async (user) => {
    await processNewUser(
      {
        uid: user.uid,
        email: user.email ?? null,
        emailVerified: user.emailVerified ?? false,
        displayName: user.displayName ?? null,
      },
      ACCESS_ADMIN_UID.value()
    );
  });

function targetUid(data: unknown): string {
  const uid = (data as { uid?: unknown } | null)?.uid;
  if (typeof uid !== "string" || !uid) {
    throw new HttpsError("invalid-argument", "Pass the target user's uid.");
  }
  return uid;
}

/** Admin-only: approve a pending (or previously denied) account. */
export const approveUser = onCall(
  { region: "us-central1", enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) => {
    requireAdmin(request);
    const uid = targetUid(request.data);
    await approveAccess(uid);
    // Operational type: delivered even though the new user hasn't configured
    // notification prefs yet, and inboxed so it's their first in-app item.
    await sendNotificationToUser(
      uid,
      {
        title: "You're in 🥃",
        body: "Your Bourbon Buddy access was approved. Welcome!",
        link: "/tabs/cellar",
      },
      "accessRequest"
    );
    return { uid, status: "approved" };
  }
);

/** Admin-only: deny a pending account or revoke an approved one. Soft. */
export const denyUser = onCall(
  { region: "us-central1", enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) => {
    const callerUid = requireAdmin(request);
    const uid = targetUid(request.data);
    await denyAccess(uid, callerUid);
    return { uid, status: "denied" };
  }
);
