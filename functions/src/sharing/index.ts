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

/** Cap on a shared hunt-list snapshot (abuse control, BB-230d). */
export const SHARED_LIST_MAX = 100;

// Wishlist statuses that make up the active hunt list — mirror of the frontend
// ACTIVE_WISHLIST_STATUSES (src/app/models/enums.ts). Only these are shared.
const ACTIVE_WISHLIST_STATUSES = new Set([
  "actively_looking",
  "casually_looking",
  "just_browsing",
]);

interface FirestoreLike {
  doc(path: string): FirebaseFirestore.DocumentReference;
  collection(path: string): FirebaseFirestore.CollectionReference;
  runTransaction<T>(fn: (tx: FirebaseFirestore.Transaction) => Promise<T>): Promise<T>;
}

/**
 * Friends-only reach + block enforcement, shared by shareBottle/shareList. A
 * block severs friendship, so the friend check nearly covers it — the block
 * checks are defense in depth and match sendFriendRequest.
 */
async function assertShareAllowed(
  db: FirestoreLike,
  fromUid: string,
  toUid: string
): Promise<void> {
  const [friendSnap, iBlocked, theyBlocked] = await Promise.all([
    db.doc(`users/${fromUid}/friends/${toUid}`).get(),
    db.doc(`users/${fromUid}/blocks/${toUid}`).get(),
    db.doc(`users/${toUid}/blocks/${fromUid}`).get(),
  ]);
  if (iBlocked.exists || theyBlocked.exists) {
    throw new HttpsError("permission-denied", "You can't share with this person.");
  }
  if (!friendSnap.exists) {
    throw new HttpsError("failed-precondition", "You can only share with friends.");
  }
}

/** Denormalized sharer identity + a display handle for the notification. */
async function sharerFields(
  db: FirestoreLike,
  fromUid: string
): Promise<{
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  who: string;
}> {
  const pub = (await db.doc(`publicProfiles/${fromUid}`).get()).data() ?? {};
  const who = pub.username
    ? `@${pub.username}`
    : (pub.displayName as string) || "A friend";
  return {
    displayName: pub.displayName ?? null,
    username: pub.username ?? null,
    avatarUrl: pub.avatarUrl ?? null,
    who,
  };
}

/**
 * Check + increment the per-user daily share counter INSIDE a transaction, so a
 * share is only ever recorded when it's also counted (no under-counting a burst).
 * Throws resource-exhausted at the cap.
 */
async function bumpShareLimit(
  tx: FirebaseFirestore.Transaction,
  limitRef: FirebaseFirestore.DocumentReference
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
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
}

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
  /**
   * The sharer's own rating (0–5), included ONLY when they opt in (BB-230b).
   * It's the sharer's own low-stakes opinion of a catalog bottle, so it's taken
   * from the client (which already holds it) and merely range-validated here.
   */
  sharerRating?: number | null;
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
  await assertShareAllowed(db, fromUid, toUid);

  // Resolve to a shared catalog id so both sides key on the same bottle.
  const bottle = await findOrCreateBourbon(db, {
    bourbonId,
    name: name || null,
    distillery: data.bottle?.distillery ?? null,
    category: data.bottle?.category ?? null,
    createdByUserId: fromUid,
  });

  const sharer = await sharerFields(db, fromUid);
  const note =
    typeof data.note === "string" ? data.note.trim().slice(0, NOTE_MAX) || null : null;
  const sharerRating =
    typeof data.sharerRating === "number" &&
    Number.isFinite(data.sharerRating) &&
    data.sharerRating >= 0 &&
    data.sharerRating <= 5
      ? data.sharerRating
      : null;

  const shareRef = db.collection(`users/${toUid}/sharedItems`).doc();
  const limitRef = db.doc(`users/${fromUid}/rateLimits/shares`);

  await db.runTransaction(async (tx) => {
    await bumpShareLimit(tx, limitRef);
    tx.set(shareRef, {
      kind: "bottle",
      fromUid,
      fromDisplayName: sharer.displayName,
      fromUsername: sharer.username,
      fromAvatarUrl: sharer.avatarUrl,
      bourbonId: bottle.id,
      bottleName: bottle.name,
      distillery: bottle.distillery,
      category: bottle.category,
      note,
      sharerRating,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  await sendNotificationToUser(
    toUid,
    {
      title: "A bottle came your way",
      body: `${sharer.who} shared ${bottle.name} with you.`,
      // Deep-links to the durable shared item so the recipient lands on the
      // receive chooser (BB-230c), not a generic list.
      link: `/shared/${shareRef.id}`,
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

export interface ShareListData {
  toUid?: string;
  note?: string | null;
}

interface SharedListBottle {
  bourbonId: string;
  bottleName: string;
  distillery: string | null;
  category: string | null;
}

/**
 * Share the sharer's FULL active hunt list as a frozen snapshot (BB-230d).
 *
 * The snapshot is read server-side (Admin SDK) from the sharer's own
 * `wishlistEntries` — authoritative, and cross-user reads on that collection are
 * owner-only, so a live subscription isn't possible anyway. Only the active
 * statuses are included, capped at SHARED_LIST_MAX. Same friends-only + block +
 * daily-limit guards as shareBottle.
 */
export async function shareListLogic(
  fromUid: string,
  data: ShareListData
): Promise<{ shareId: string; bottleCount: number }> {
  const toUid = data?.toUid;
  if (!toUid || typeof toUid !== "string") {
    throw new HttpsError("invalid-argument", "Who do you want to share with?");
  }
  if (toUid === fromUid) {
    throw new HttpsError("invalid-argument", "You can't share with yourself.");
  }

  const db = getFirestore();
  await assertShareAllowed(db, fromUid, toUid);

  // Frozen snapshot of the ACTIVE hunt list, name-sorted and size-capped.
  const listSnap = await db.collection(`users/${fromUid}/wishlistEntries`).get();
  const bottles: SharedListBottle[] = listSnap.docs
    .map((d) => d.data())
    .filter(
      (e) =>
        typeof e.status === "string" &&
        ACTIVE_WISHLIST_STATUSES.has(e.status) &&
        typeof e.bourbonId === "string" &&
        typeof e.bourbonName === "string"
    )
    .sort((a, b) =>
      String(a.bourbonName).localeCompare(String(b.bourbonName))
    )
    .slice(0, SHARED_LIST_MAX)
    .map((e) => ({
      bourbonId: e.bourbonId as string,
      bottleName: e.bourbonName as string,
      distillery: (e.distillery as string) ?? null,
      category: (e.category as string) ?? null,
    }));
  if (bottles.length === 0) {
    throw new HttpsError(
      "failed-precondition",
      "Your hunt list is empty — nothing to share."
    );
  }

  const sharer = await sharerFields(db, fromUid);
  const note =
    typeof data.note === "string" ? data.note.trim().slice(0, NOTE_MAX) || null : null;

  const shareRef = db.collection(`users/${toUid}/sharedItems`).doc();
  const limitRef = db.doc(`users/${fromUid}/rateLimits/shares`);

  await db.runTransaction(async (tx) => {
    await bumpShareLimit(tx, limitRef);
    tx.set(shareRef, {
      kind: "list",
      fromUid,
      fromDisplayName: sharer.displayName,
      fromUsername: sharer.username,
      fromAvatarUrl: sharer.avatarUrl,
      bottles,
      bottleCount: bottles.length,
      note,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  await sendNotificationToUser(
    toUid,
    {
      title: "A hunt list came your way",
      body: `${sharer.who} shared ${bottles.length} bottle${
        bottles.length === 1 ? "" : "s"
      } with you.`,
      link: `/shared/${shareRef.id}`,
      data: { type: "listShare", shareId: shareRef.id },
    },
    "listShare"
  );
  logger.info(
    `List share ${shareRef.id} (${bottles.length} bottles) from ${fromUid} to ${toUid}.`
  );

  return { shareId: shareRef.id, bottleCount: bottles.length };
}

export const shareList = onCall(
  { region: "us-central1", enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) => {
    const fromUid = requireApproved(request);
    return shareListLogic(fromUid, (request.data ?? {}) as ShareListData);
  }
);
