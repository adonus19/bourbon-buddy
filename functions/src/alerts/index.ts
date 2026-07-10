/**
 * Sighting-driven alerts.
 *
 * Personal price alert (Iteration 7, repointed in BB-161): on a fresh, non-stale
 * sighting at/below one of the SPOTTER's own hunt-list targets, push a
 * `priceAlert` to the spotter. Create-only, unchanged behavior.
 *
 * Sighting Match Alert ★ (BB-112): when a `visibility: 'friends'` sighting is
 * created (or its price drops meaningfully later), find the spotter's FRIENDS
 * who have the same bottle on their active hunt list and push a `sightingMatch`
 * to each. Delivery/inbox/pref gating is handled by sendNotificationToUser.
 *
 * The trigger is onDocumentWritten (not onCreated) so a later price drop can
 * re-alert — but a per-recipient marker at
 * `/sightings/{id}/alertRecipients/{uid}` enforces at-most-once and requires a
 * >= PRICE_DROP_PCT drop below the last-alerted price before re-sending. Blocks
 * need no explicit check here: blocking severs the friendship edge, so a blocked
 * user simply isn't in the spotter's /friends list.
 */
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { onDocumentWritten } from "firebase-functions/v2/firestore";

import { sendNotificationToUser } from "../notifications";
import { withinAlertRadius } from "../shared/geo";
import { matchTaste, TasteVector } from "../taste/taste-vector";

const ACTIVE_STATUSES = [
  "actively_looking",
  "casually_looking",
  "just_browsing",
];
const STALE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const PRICE_DROP_PCT = 0.05; // re-alert only on a >= 5% drop below last alerted

export const onSightingCreated = onDocumentWritten(
  { document: "sightings/{sightingId}", region: "us-central1" },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) {
      return; // deleted
    }
    const sighting = after.data();
    if (!sighting) {
      return;
    }
    const isCreate = !event.data?.before?.exists;

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
    if (
      sightingDate &&
      Date.now() - sightingDate.toMillis() > STALE_DAYS * DAY_MS
    ) {
      return;
    }

    const db = getFirestore();
    const store = (sighting.storeName as string) ?? "a store";
    const bottleName = (sighting.bourbonName as string) ?? "A bottle";

    // 1) Personal price alert on the spotter's own hunt list (create only).
    if (isCreate) {
      await personalPriceAlerts(db, spotterUid, bourbonId, price, store);
    }

    // 2) Sighting Match Alerts to the spotter's friends (BB-112), filtered by
    //    each recipient's alert radius (BB-180).
    if (sighting.visibility === "friends") {
      await friendMatchAlerts(
        db,
        event.params.sightingId,
        spotterUid,
        bourbonId,
        price,
        store,
        bottleName,
        locSuffix(sighting),
        { lat: sighting.lat, lng: sighting.lng },
        (sighting.flavorTags as {
          nose: string[];
          palate: string[];
          finish: string[];
        } | null) ?? null
      );
    }
  }
);

/** The spotter's own active hunt-list entries beaten by this sighting. */
async function personalPriceAlerts(
  db: FirebaseFirestore.Firestore,
  spotterUid: string,
  bourbonId: string,
  price: number,
  store: string
): Promise<void> {
  const entries = await db
    .collection(`users/${spotterUid}/wishlistEntries`)
    .where("bourbonId", "==", bourbonId)
    .get();

  for (const doc of entries.docs) {
    const entry = doc.data();
    const target = entry.targetPrice as number | undefined;
    if (typeof target !== "number" || price > target) {
      continue;
    }
    if (!ACTIVE_STATUSES.includes(entry.status as string)) {
      continue;
    }
    const name = (entry.bourbonName as string) ?? "A bottle";
    await sendNotificationToUser(
      spotterUid,
      {
        title: "Price alert 🎯",
        body: `${name} sighted at $${price} at ${store} — at or below your $${target} target.`,
        link: `/wishlist/${doc.id}`,
        data: { type: "priceAlert", entryId: doc.id },
      },
      "priceAlert"
    );
    logger.info(`Price alert ${spotterUid}/${doc.id}: $${price} <= $${target}.`);
  }
}

/**
 * Friends who have this bottle on their active hunt list get a match alert;
 * friends who DON'T but whose taste vector matches the sighting's flavor tags
 * get a Taste Match alert instead (BB-199). One notification per sighting per
 * recipient — the hunt-list match is the stronger signal and takes precedence,
 * and the shared alertRecipients marker keeps the two types from stacking.
 */
async function friendMatchAlerts(
  db: FirebaseFirestore.Firestore,
  sightingId: string,
  spotterUid: string,
  bourbonId: string,
  price: number,
  store: string,
  bottleName: string,
  loc: string,
  coords: { lat?: unknown; lng?: unknown },
  flavorTags: { nose: string[]; palate: string[]; finish: string[] } | null
): Promise<void> {
  const friendsSnap = await db.collection(`users/${spotterUid}/friends`).get();
  if (friendsSnap.empty) {
    return;
  }
  const spotterPub =
    (await db.doc(`publicProfiles/${spotterUid}`).get()).data() ?? {};
  const spotterName = spotterPub.username
    ? `@${spotterPub.username}`
    : (spotterPub.displayName as string) ?? "A friend";

  for (const friend of friendsSnap.docs) {
    const recipientUid = friend.id;

    const entries = await db
      .collection(`users/${recipientUid}/wishlistEntries`)
      .where("bourbonId", "==", bourbonId)
      .get();
    const match = entries.docs.find((d) =>
      ACTIVE_STATUSES.includes(d.data().status as string)
    );

    // Without a hunt-list match, a taste match (from the vector maintained on
    // the profile doc) is the only reason to keep going for this friend.
    let tasteTags: string[] = [];
    let recipient: FirebaseFirestore.DocumentData | null = null;
    if (!match) {
      if (!flavorTags) {
        continue; // pre-BB-199 sighting or unprofiled bottle
      }
      recipient = (await db.doc(`users/${recipientUid}`).get()).data() ?? {};
      const taste = matchTaste(
        (recipient.tasteVector as TasteVector | undefined) ?? null,
        flavorTags
      );
      if (!taste.matched) {
        continue;
      }
      tasteTags = taste.tags;
    }

    // Proximity filter (BB-180): drop silently when the recipient set a base
    // location and this sighting is beyond their radius. Fails open — no base
    // location or no sighting coords means we still deliver.
    if (!recipient) {
      recipient = (await db.doc(`users/${recipientUid}`).get()).data() ?? {};
    }
    if (!withinAlertRadius(coords, recipient)) {
      continue;
    }

    // At-most-once per (sighting, recipient); re-alert only on a real drop —
    // and only for hunt-list matches (a taste hint never re-fires).
    const markerRef = db.doc(
      `sightings/${sightingId}/alertRecipients/${recipientUid}`
    );
    const marker = await markerRef.get();
    if (marker.exists) {
      const lastPrice = marker.get("lastPrice") as number;
      if (!match || !(price <= lastPrice * (1 - PRICE_DROP_PCT))) {
        continue;
      }
    }

    const sent = match
      ? await sendNotificationToUser(
          recipientUid,
          {
            title: `${spotterName} spotted a bottle you want 🥃`,
            body: `${bottleName} — $${price} at ${store}${loc}`,
            link: `/wishlist/${match.id}`,
            data: { type: "sightingMatch", sightingId, entryId: match.id },
          },
          "sightingMatch"
        )
      : await sendNotificationToUser(
          recipientUid,
          {
            title: `${spotterName} spotted a bottle you might love ✨`,
            body:
              `${bottleName} matches your taste (${tasteTags
                .slice(0, 3)
                .join(", ")}) — $${price} at ${store}${loc}`,
            link: `/tabs/social/feed`,
            data: { type: "tasteMatch", sightingId },
          },
          "tasteMatch"
        );
    await markerRef.set({
      lastPrice: price,
      sentAt: FieldValue.serverTimestamp(),
    });
    logger.info(
      `${match ? "Match" : "Taste"} alert ${sightingId} -> ${recipientUid}: ${sent} device(s).`
    );
  }
}

/** Compact "(City, ST)" suffix for the alert body, or "" when unknown. */
function locSuffix(s: FirebaseFirestore.DocumentData): string {
  const city = s.city as string | undefined;
  const state = s.state as string | undefined;
  if (city && state) {
    return ` (${city}, ${state})`;
  }
  if (city) {
    return ` (${city})`;
  }
  if (state) {
    return ` (${state})`;
  }
  return "";
}
