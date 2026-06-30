/**
 * Wishlist price alerts (Iteration 7).
 *
 * When a sighting is logged at or below a wishlist entry's `targetPrice`, push a
 * `priceAlert` to the owner (gated by their notification preference). Today
 * sightings are self-logged, so this mostly confirms your own finds across
 * devices — but it's the exact trigger that becomes powerful once sightings are
 * crowd-sourced (a friend's shared sighting beating your target, Phase 4).
 */
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

import { sendNotificationToUser } from "../notifications";

const ACTIVE_STATUSES = [
  "actively_looking",
  "casually_looking",
  "just_browsing",
];
const STALE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export const onSightingCreated = onDocumentCreated(
  {
    document: "users/{uid}/wishlistEntries/{entryId}/sightings/{sightingId}",
    region: "us-central1",
  },
  async (event) => {
    const sighting = event.data?.data();
    if (!sighting) {
      return;
    }
    const { uid, entryId } = event.params;

    const price = sighting.price as number | undefined;
    if (typeof price !== "number") {
      return;
    }

    // Skip stale sightings — manually flagged or too old to act on.
    if (sighting.markedStaleManually) {
      return;
    }
    const sightingDate = sighting.sightingDate as Timestamp | undefined;
    if (sightingDate && Date.now() - sightingDate.toMillis() > STALE_DAYS * DAY_MS) {
      return;
    }

    const db = getFirestore();
    const entrySnap = await db
      .doc(`users/${uid}/wishlistEntries/${entryId}`)
      .get();
    const entry = entrySnap.data();
    if (!entry) {
      return;
    }

    const target = entry.targetPrice as number | undefined;
    if (typeof target !== "number" || price > target) {
      return; // no target set, or the sighting isn't a deal
    }
    if (!ACTIVE_STATUSES.includes(entry.status as string)) {
      return; // already bought / given up
    }

    const name = (entry.bourbonName as string) ?? "A bottle";
    const store = (sighting.storeName as string) ?? "a store";
    await sendNotificationToUser(
      uid,
      {
        title: "Price alert 🎯",
        body: `${name} sighted at $${price} at ${store} — at or below your $${target} target.`,
        link: `/wishlist/${entryId}`,
      },
      "priceAlert"
    );
    logger.info(`Price alert sent for ${uid}/${entryId}: $${price} <= $${target}.`);
  }
);
