/**
 * Notification delivery (BB-090 backend).
 *
 * `sendNotificationToUser` is the reusable send-helper every future alert
 * (sighting match, price alert, friend request, news digest) calls. It honors
 * the user's preferences, fans out to all their devices, and prunes dead tokens.
 *
 * `sendTestNotification` is a callable the app uses to verify the whole loop.
 */
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";

export type NotificationType =
  | "sightingMatch"
  | "priceAlert"
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

  if (type) {
    const prefsSnap = await db.doc(`users/${uid}/settings/notifications`).get();
    const prefs = prefsSnap.data() ?? {};
    if (prefs.pausedAll || !prefs[type]) {
      logger.info(`Skip ${type} for ${uid}: paused or not enabled.`);
      return 0;
    }
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
    notification: { title: payload.title, body: payload.body },
    data: {
      ...(payload.data ?? {}),
      ...(payload.link ? { link: payload.link } : {}),
    },
    webpush: {
      fcmOptions: payload.link ? { link: payload.link } : undefined,
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
  // TODO(BB-113): also write an inbox record so missed pushes are recoverable.
  return response.successCount;
}

export const sendTestNotification = onCall(
  { region: "us-central1" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sign in to test notifications.");
    }
    const sent = await sendNotificationToUser(uid, {
      title: "Bourbon Buddy",
      body: "🥃 Test notification — your push is working.",
      link: "/tabs/dispatch",
    });
    return { sent };
  }
);
