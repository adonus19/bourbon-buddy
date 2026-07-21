/**
 * Friends-only in-app sharing (BB-230).
 *
 * `shareBottle` is the ONLY way a /users/{toUid}/sharedItems doc is created for
 * a bottle — a client can't write another user's docs, so the cross-user write
 * lives here behind the same guards as friend requests: approved caller,
 * friends-only reach, block enforcement, and a per-user daily rate limit. It
 * findOrCreates the catalog bottle server-side so both sides key on the same
 * `bourbonId` (Radar/Dispatch bottles often have none), writes the durable
 * shared item, and notifies the recipient (respecting their `bottleShare` pref).
 *
 * The shared item is durable state (it outlives the 30-day notification TTL);
 * the push merely deep-links to it. What's shared is the CATALOG bottle, never
 * the sharer's log entry. `shareList` (the frozen hunt-list snapshot) lands in
 * BB-230d on this same foundation.
 */
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { findOrCreateBourbon } from "../shared/catalog";
import { ENFORCE_APP_CHECK, requireApproved } from "../shared/guards";
import { sendNotificationToUser } from "../notifications";

/** Per-user daily cap on shares sent (abuse control, BB-122 pattern). */
export const DAILY_SHARE_LIMIT = 50;

/** Max length of the optional sharer note. */
const NOTE_MAX = 280;

export interface ShareBottleData {
  toUid?: string;
  /** Preferred catalog id; when absent (Radar/Dispatch bottle) `bottle` is used. */
  bourbonId?: string | null;
  bottle?: {
    name?: string | null;
    distillery?: string | null;
    category?: string | null;
  };
  note?: string | null;
}

/**
 * The share core, decoupled from the onCall wrapper so it's unit-testable
 * (the wrapper is a thin auth delegate). Returns the new share + resolved id.
 */
export async function shareBottleLogic(
  fromUid: string,
  data: ShareBottleData
): Promise<{ shareId: string; bourbonId: string }> {
  const toUid = data?.toUid;
  if (!toUid || typeof toUid !== "string") {
    throw new HttpsError("invalid-argument", "Who do you want to share with?");
  }
  if (toUid === fromUid) {
    throw new HttpsError("invalid-argument", "You can't share with yourself.");
  }
  const bourbonId =
    typeof data.bourbonId === "string" && data.bourbonId ? data.bourbonId : null;
  const name = (data.bottle?.name ?? "").trim();
  if (!bourbonId && !name) {
    throw new HttpsError("invalid-argument", "There's nothing to share.");
  }

  const db = getFirestore();

  // Friends-only reach + block enforcement. A block severs friendship, so the
  // friend check alone nearly covers it — the block checks are defense in depth
  // and match sendFriendRequest, keeping the policy in one recognizable shape.
  const [friendSnap, iBlocked, theyBlocked] = await Promise.all([
    db.doc(`users/${fromUid}/friends/${toUid}`).get(),
    db.doc(`users/${fromUid}/blocks/${toUid}`).get(),
    db.doc(`users/${toUid}/blocks/${fromUid}`).get(),
  ]);
  if (iBlocked.exists || theyBlocked.exists) {
    throw new HttpsError("permission-denied", "You can't share with this person.");
  }
  if (!friendSnap.exists) {
    throw new HttpsError(
      "failed-precondition",
      "You can only share with friends."
    );
  }

  // Resolve to a shared catalog id so both sides key on the same bottle.
  const bottle = await findOrCreateBourbon(db, {
    bourbonId,
    name: name || null,
    distillery: data.bottle?.distillery ?? null,
    category: data.bottle?.category ?? null,
    createdByUserId: fromUid,
  });

  const fromPub = (await db.doc(`publicProfiles/${fromUid}`).get()).data() ?? {};
  const note =
    typeof data.note === "string" ? data.note.trim().slice(0, NOTE_MAX) || null : null;

  const shareRef = db.collection(`users/${toUid}/sharedItems`).doc();
  const limitRef = db.doc(`users/${fromUid}/rateLimits/shares`);
  const today = new Date().toISOString().slice(0, 10);

  // Rate-limit + durable write together, so a share is only ever recorded when
  // it's also counted (no under-counting a spam burst).
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(limitRef);
    const d = snap.data();
    const count = d && d.day === today ? (d.count as number) : 0;
    if (count >= DAILY_SHARE_LIMIT) {
      throw new HttpsError(
        "resource-exhausted",
        `Daily limit of ${DAILY_SHARE_LIMIT} shares reached. Try again tomorrow.`
      );
    }
    tx.set(limitRef, {
      day: today,
      count: count + 1,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(shareRef, {
      kind: "bottle",
      fromUid,
      fromDisplayName: fromPub.displayName ?? null,
      fromUsername: fromPub.username ?? null,
      fromAvatarUrl: fromPub.avatarUrl ?? null,
      bourbonId: bottle.id,
      bottleName: bottle.name,
      distillery: bottle.distillery,
      category: bottle.category,
      note,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  const who = fromPub.username
    ? `@${fromPub.username}`
    : (fromPub.displayName as string) || "A friend";
  await sendNotificationToUser(
    toUid,
    {
      title: "A bottle came your way",
      body: `${who} shared ${bottle.name} with you.`,
      link: "/tabs/hunt-list?shared=1",
      data: {
        type: "bottleShare",
        shareId: shareRef.id,
        bourbonId: bottle.id,
      },
    },
    "bottleShare"
  );
  logger.info(`Bottle share ${shareRef.id} from ${fromUid} to ${toUid}.`);

  return { shareId: shareRef.id, bourbonId: bottle.id };
}

export const shareBottle = onCall(
  { region: "us-central1", enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) => {
    const fromUid = requireApproved(request);
    return shareBottleLogic(fromUid, (request.data ?? {}) as ShareBottleData);
  }
);
