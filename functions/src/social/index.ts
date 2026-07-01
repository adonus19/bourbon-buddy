/**
 * Social graph — friend requests & edges (BB-101/102/103).
 *
 * All cross-user writes live here because a client can't write another user's
 * docs. `sendFriendRequest` is the ONLY way a /friendRequests doc is created
 * (rules deny direct create): it runs the self/block/duplicate checks and a
 * per-user daily rate limit. `onFriendRequestCreated` notifies the recipient.
 *
 * (respondToFriendRequest + removeFriend land in the next passes — BB-102/103.)
 */
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

import { sendNotificationToUser } from "../notifications";

const DAILY_REQUEST_LIMIT = 20;

interface SendFriendRequestData {
  toUid?: string;
}

export const sendFriendRequest = onCall(
  { region: "us-central1" },
  async (request) => {
    const fromUid = request.auth?.uid;
    if (!fromUid) {
      throw new HttpsError("unauthenticated", "Sign in to add friends.");
    }
    const toUid = (request.data as SendFriendRequestData)?.toUid;
    if (!toUid || typeof toUid !== "string") {
      throw new HttpsError("invalid-argument", "Who do you want to add?");
    }
    if (toUid === fromUid) {
      throw new HttpsError("invalid-argument", "You can't friend yourself.");
    }

    const db = getFirestore();

    // Target must exist and be discoverable.
    const toPubSnap = await db.doc(`publicProfiles/${toUid}`).get();
    if (!toPubSnap.exists || !toPubSnap.get("isDiscoverable")) {
      throw new HttpsError("not-found", "That person can't be found.");
    }

    // A block in EITHER direction stops the request.
    const [iBlocked, theyBlocked, alreadyFriends] = await Promise.all([
      db.doc(`users/${fromUid}/blocks/${toUid}`).get(),
      db.doc(`users/${toUid}/blocks/${fromUid}`).get(),
      db.doc(`users/${fromUid}/friends/${toUid}`).get(),
    ]);
    if (iBlocked.exists || theyBlocked.exists) {
      throw new HttpsError(
        "permission-denied",
        "You can't send a request to this person."
      );
    }
    if (alreadyFriends.exists) {
      throw new HttpsError("already-exists", "You're already friends.");
    }

    // A pending request in EITHER direction blocks a new one.
    const [outPending, inPending] = await Promise.all([
      db
        .collection("friendRequests")
        .where("fromUid", "==", fromUid)
        .where("toUid", "==", toUid)
        .where("status", "==", "pending")
        .limit(1)
        .get(),
      db
        .collection("friendRequests")
        .where("fromUid", "==", toUid)
        .where("toUid", "==", fromUid)
        .where("status", "==", "pending")
        .limit(1)
        .get(),
    ]);
    if (!outPending.empty) {
      throw new HttpsError("already-exists", "You already have a request pending.");
    }
    if (!inPending.empty) {
      throw new HttpsError(
        "already-exists",
        "They've already sent you a request — check your requests."
      );
    }

    const fromPub = (await db.doc(`publicProfiles/${fromUid}`).get()).data() ?? {};
    const toPub = toPubSnap.data() ?? {};

    const reqRef = db.collection("friendRequests").doc();
    const limitRef = db.doc(`users/${fromUid}/rateLimits/friendRequests`);
    const today = new Date().toISOString().slice(0, 10);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(limitRef);
      const data = snap.data();
      const count = data && data.day === today ? (data.count as number) : 0;
      if (count >= DAILY_REQUEST_LIMIT) {
        throw new HttpsError(
          "resource-exhausted",
          `Daily limit of ${DAILY_REQUEST_LIMIT} friend requests reached. Try again tomorrow.`
        );
      }
      tx.set(limitRef, {
        day: today,
        count: count + 1,
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(reqRef, {
        fromUid,
        toUid,
        status: "pending",
        fromDisplayName: fromPub.displayName ?? null,
        fromUsername: fromPub.username ?? null,
        fromAvatarUrl: fromPub.avatarUrl ?? null,
        toDisplayName: toPub.displayName ?? null,
        toUsername: toPub.username ?? null,
        toAvatarUrl: toPub.avatarUrl ?? null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return { id: reqRef.id };
  }
);

interface RespondData {
  requestId?: string;
  action?: "accept" | "decline";
}

/**
 * Recipient accepts or declines a pending request (BB-102). Accept writes both
 * reciprocal /friends edges, bumps both friendCounts, and marks the request —
 * all in ONE transaction, so it's all-or-nothing and re-accepting is idempotent
 * (an already-accepted request no-ops instead of double-counting).
 */
export const respondToFriendRequest = onCall(
  { region: "us-central1" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sign in to respond.");
    }
    const { requestId, action } = (request.data as RespondData) ?? {};
    if (!requestId || (action !== "accept" && action !== "decline")) {
      throw new HttpsError("invalid-argument", "Missing request or action.");
    }

    const db = getFirestore();
    const reqRef = db.doc(`friendRequests/${requestId}`);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(reqRef);
      if (!snap.exists) {
        throw new HttpsError("not-found", "That request no longer exists.");
      }
      const data = snap.data() ?? {};
      if (data.toUid !== uid) {
        throw new HttpsError(
          "permission-denied",
          "That request isn't yours to answer."
        );
      }
      if (data.status === "accepted") {
        return; // idempotent — already friends
      }
      if (data.status !== "pending") {
        throw new HttpsError(
          "failed-precondition",
          "That request is no longer pending."
        );
      }

      const fromUid = data.fromUid as string;
      const toUid = data.toUid as string;
      const now = FieldValue.serverTimestamp();

      if (action === "decline") {
        tx.update(reqRef, { status: "declined", updatedAt: now });
        return;
      }

      // Accept: reciprocal edges + counts + status, together or not at all.
      tx.set(db.doc(`users/${fromUid}/friends/${toUid}`), { since: now });
      tx.set(db.doc(`users/${toUid}/friends/${fromUid}`), { since: now });
      tx.update(reqRef, { status: "accepted", updatedAt: now });
      for (const u of [fromUid, toUid]) {
        tx.set(
          db.doc(`users/${u}`),
          { friendCount: FieldValue.increment(1) },
          { merge: true }
        );
        tx.set(
          db.doc(`publicProfiles/${u}`),
          { friendCount: FieldValue.increment(1) },
          { merge: true }
        );
      }
    });

    return { ok: true };
  }
);

/** Pushes a "new friend request" notification to the recipient (respects prefs). */
export const onFriendRequestCreated = onDocumentCreated(
  "friendRequests/{requestId}",
  async (event) => {
    const data = event.data?.data();
    if (!data || data.status !== "pending") {
      return;
    }
    const toUid = data.toUid as string;
    const who = data.fromUsername
      ? `@${data.fromUsername}`
      : (data.fromDisplayName as string) || "Someone";

    const sent = await sendNotificationToUser(
      toUid,
      {
        title: "New friend request",
        body: `${who} wants to connect on Bourbon Buddy.`,
        link: "/friends",
        data: { type: "friendRequest", requestId: event.params.requestId },
      },
      "friendRequest"
    );
    logger.info(`Friend-request push to ${toUid}: ${sent} device(s).`);
  }
);
