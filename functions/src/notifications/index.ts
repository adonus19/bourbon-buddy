/**
 * Notification delivery (BB-090 backend).
 *
 * `sendNotificationToUser` is the reusable send-helper every future alert
 * (sighting match, price alert, friend request, news digest) calls. It honors
 * the user's preferences, fans out to all their devices, and prunes dead tokens.
 *
 * `sendTestNotification` is a callable the app uses to verify the whole loop.
 */
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";

import { ENFORCE_APP_CHECK } from "../shared/guards";

export type NotificationType =
  | "sightingMatch"
  | "priceAlert"
  | "tasteMatch"
  | "friendRequest"
  | "newsDigest";

export interface PushPayload {
  title: string;
  body: string;
  link?: string; // in-app deep-link path, e.g. "/tabs/dispatch"
  data?: Record<string, string>;
}

const DEAD_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

/**
 * Sends a push to every device of `uid`. When `type` is given, the user's
 * preference for that type (and the master pause) gate delivery; omit `type`
 * for unconditional sends (e.g. the connectivity test). Returns the success
 * count. Tokens FCM reports as dead are deleted.
 */
export async function sendNotificationToUser(
  uid: string,
  payload: PushPayload,
  type?: NotificationType
): Promise<number> {
  const db = getFirestore();

  // Unread inbox count → OS app-icon badge (BB-093). Computed after the inbox
  // record is written so it includes this notification.
  let badgeCount: number | null = null;

  if (type) {
    const prefsSnap = await db.doc(`users/${uid}/settings/notifications`).get();
    const prefs = prefsSnap.data() ?? {};
    if (prefs.pausedAll || !prefs[type]) {
      logger.info(`Skip ${type} for ${uid}: paused or not enabled.`);
      return 0;
    }
    // Inbox record (BB-113): written whether or not a device is reachable, so a
    // missed push is still recoverable in-app. The untyped test send is skipped.
    await db.collection(`users/${uid}/notifications`).add({
      type,
      title: payload.title,
      body: payload.body,
      link: payload.link ?? null,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
    const unread = await db
      .collection(`users/${uid}/notifications`)
      .where("read", "==", false)
      .count()
      .get();
    badgeCount = unread.data().count;
  }

  const tokensSnap = await db.collection(`users/${uid}/fcmTokens`).get();
  if (tokensSnap.empty) {
    logger.info(`No device tokens for ${uid}.`);
    return 0;
  }
  const tokenDocs = tokensSnap.docs;
  const tokens = tokenDocs.map((d) => d.get("token") as string).filter(Boolean);

  const response = await getMessaging().sendEachForMulticast({
    tokens,
    // Data-only (BB-092): our service worker renders every push via a raw
    // `push` handler — the only path that fires reliably on iOS PWAs. A
    // top-level `notification` field would auto-display and double-fire on
    // platforms where the browser shows it too, so we keep it all in `data`.
    data: {
      title: payload.title,
      body: payload.body,
      ...(payload.link ? { link: payload.link } : {}),
      ...(badgeCount != null ? { badge: String(badgeCount) } : {}),
      ...(payload.data ?? {}),
    },
  });

  const deadIds: string[] = [];
  response.responses.forEach((r, i) => {
    if (!r.success && r.error && DEAD_TOKEN_CODES.has(r.error.code)) {
      deadIds.push(tokenDocs[i].id);
    }
  });
  await Promise.all(
    deadIds.map((id) => db.doc(`users/${uid}/fcmTokens/${id}`).delete())
  );

  logger.info(
    `Sent to ${uid}: ${response.successCount}/${tokens.length} ok, ` +
      `${deadIds.length} dead tokens pruned.`
  );
  return response.successCount;
}

const NOTIFICATION_TTL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Purges inbox notifications older than 30 days (BB-113), keeping it bounded. */
export const cleanupOldNotifications = onSchedule(
  { schedule: "0 3 * * *", timeoutSeconds: 300 }, // daily, 03:00
  async () => {
    const db = getFirestore();
    const cutoff = Timestamp.fromMillis(
      Date.now() - NOTIFICATION_TTL_DAYS * DAY_MS
    );
    let deleted = 0;

    for (;;) {
      const snap = await db
        .collectionGroup("notifications")
        .where("createdAt", "<", cutoff)
        .limit(400)
        .get();
      if (snap.empty) {
        break;
      }
      const batch = db.batch();
      snap.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      deleted += snap.size;
      if (snap.size < 400) {
        break;
      }
    }
    logger.info(`cleanupOldNotifications removed ${deleted} notifications.`);
  }
);

export const sendTestNotification = onCall(
  { region: "us-central1", enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sign in to test notifications.");
    }
    const sent = await sendNotificationToUser(uid, {
      title: "Bourbon Buddy",
      body: "🥃 Test notification — your push is working.",
      link: "/tabs/dispatch",
      // Carry a badge so the test also exercises the app-icon badge (BB-093).
      // (The untyped test writes no inbox record, so the count is a stand-in;
      // opening the app resyncs the badge to the real unread total.)
      data: { badge: "1" },
    });
    return { sent };
  }
);
