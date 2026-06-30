/**
 * Wishlist price alerts (Iteration 7, repointed in BB-161).
 *
 * Triggers on first-class `/sightings` docs now. When a fresh, non-stale sighting
 * is at or below a wishlist entry's `targetPrice`, push a `priceAlert` to the
 * owner (gated by their notification preference). Today this fires on the
 * spotter's own wishlist; in BB-112 the same trigger also matches the spotter's
 * friends' active hunt lists when visibility === 'friends'.
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
  { document: "sightings/{sightingId}", region: "us-central1" },
  async (event) => {
    const sighting = event.data?.data();
    if (!sighting) {
      return;
    }

    const price = sighting.price as number | undefined;
    const bourbonId = sighting.bourbonId as string | undefined;
    const spotterUid = sighting.spotterUid as string | undefined;
    if (typeof price !== "number" || !bourbonId || !spotterUid) {
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
    // The spotter's own active wishlist entries for this bottle with a target.
    const entries = await db
      .collection(`users/${spotterUid}/wishlistEntries`)
      .where("bourbonId", "==", bourbonId)
      .get();

    const store = (sighting.storeName as string) ?? "a store";

    for (const doc of entries.docs) {
      const entry = doc.data();
      const target = entry.targetPrice as number | undefined;
      if (typeof target !== "number" || price > target) {
        continue; // no target, or not a deal
      }
      if (!ACTIVE_STATUSES.includes(entry.status as string)) {
        continue; // already bought / given up
      }

      const name =
        (entry.bourbonName as string) ??
        (sighting.bourbonName as string) ??
        "A bottle";
      await sendNotificationToUser(
        spotterUid,
        {
          title: "Price alert 🎯",
          body: `${name} sighted at $${price} at ${store} — at or below your $${target} target.`,
          link: `/wishlist/${doc.id}`,
        },
        "priceAlert"
      );
      logger.info(
        `Price alert sent for ${spotterUid}/${doc.id}: $${price} <= $${target}.`
      );
    }
    // BB-112: also match the spotter's friends' active hunt lists here when
    // sighting.visibility === "friends".
  }
);
