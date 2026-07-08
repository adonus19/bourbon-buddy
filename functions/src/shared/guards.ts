/**
 * Shared callable guards (BB-190): per-user daily budgets and admin gating.
 *
 * `consumeDailyLimit` runs its own transaction, so it suits callables whose
 * expensive work (external API call, AI generation) is not itself a Firestore
 * write. Callables that already wrap their write in a transaction (logSighting,
 * sendFriendRequest) keep the inline copy of this pattern so the counter and
 * the payload commit atomically together.
 */
import { FieldValue, Firestore } from "firebase-admin/firestore";
import { CallableRequest, HttpsError } from "firebase-functions/v2/https";

/**
 * App Check enforcement (BB-121), one switch for every callable. Deploying with
 * this true requires the console setup in docs/app-check-setup.md first —
 * clients without a valid App Check token are rejected before our code runs.
 * Flip to false only as an emergency escape hatch.
 */
export const ENFORCE_APP_CHECK = true;

/** UTC day key, e.g. "2026-07-08" — same shape the inline limiters use. */
export function todayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Consume one unit of `users/{uid}/rateLimits/{key}` for today, throwing
 * `resource-exhausted` with `message` once `limit` units are spent.
 */
export async function consumeDailyLimit(
  db: Firestore,
  uid: string,
  key: string,
  limit: number,
  message: string
): Promise<void> {
  const ref = db.doc(`users/${uid}/rateLimits/${key}`);
  const today = todayKey();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    const count = data && data.day === today ? (data.count as number) : 0;
    if (count >= limit) {
      throw new HttpsError("resource-exhausted", message);
    }
    tx.set(ref, {
      day: today,
      count: count + 1,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

/**
 * Require the caller to hold the `admin: true` custom claim (set via
 * functions/scripts/set-admin-claim.js). For operator tools like backfills.
 */
export function requireAdmin(request: CallableRequest): string {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in first.");
  }
  if (request.auth?.token?.admin !== true) {
    throw new HttpsError(
      "permission-denied",
      "This is an operator tool; it requires the admin claim."
    );
  }
  return uid;
}
