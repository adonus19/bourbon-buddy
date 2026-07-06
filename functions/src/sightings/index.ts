/**
 * Sighting creation guards (BB-163, creation-side).
 *
 * `logSighting` is the ONLY path that creates a /sightings doc — the security
 * rules deny direct client writes. It validates input and enforces a per-user
 * daily rate limit (so one user can't log every bottle in a store / a bot can't
 * flood the collection). `cleanupStaleSightings` bounds the collection over time.
 *
 * Not here (by design): App Check (BB-121, the bot/direct-endpoint defense) and
 * the fan-out caps/coalescing (BB-163 fan-out-side, ships with social in It10).
 */
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";

import { DAY_MS, LogSightingData, validate } from "./validate";
import { encodeGeohash } from "../shared/geohash";

const DAILY_SIGHTING_LIMIT = 40;
// BB-171: sightings go stale at 30 days, so drop them at 30 rather than 90.
const STALE_CLEANUP_DAYS = 30;

export const logSighting = onCall({ region: "us-central1" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in to log a sighting.");
  }
  const v = validate(request.data as LogSightingData);
  const d = request.data as LogSightingData;

  const db = getFirestore();
  const sightingRef = db.collection("sightings").doc();
  const limitRef = db.doc(`users/${uid}/rateLimits/sightings`);
  const today = new Date().toISOString().slice(0, 10);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(limitRef);
    const data = snap.data();
    const count = data && data.day === today ? (data.count as number) : 0;
    if (count >= DAILY_SIGHTING_LIMIT) {
      throw new HttpsError(
        "resource-exhausted",
        `Daily limit of ${DAILY_SIGHTING_LIMIT} sightings reached. Try again tomorrow.`
      );
    }
    tx.set(limitRef, {
      day: today,
      count: count + 1,
      updatedAt: FieldValue.serverTimestamp(),
    });
    // Opt-in location (BB-177): geohash is derived server-side from the
    // validated coordinates so it's always consistent with lat/lng.
    const geohash =
      v.lat != null && v.lng != null ? encodeGeohash(v.lat, v.lng) : null;

    tx.set(sightingRef, {
      bourbonId: v.bourbonId,
      bourbonName: d.bourbonName ?? null,
      spotterUid: uid,
      storeName: v.storeName,
      price: v.price,
      sightingDate: Timestamp.fromMillis(v.sightingDateMillis),
      city: d.city ?? null,
      state: d.state ?? null,
      notes: d.notes ?? null,
      lat: v.lat,
      lng: v.lng,
      geohash,
      markedStaleManually: false,
      visibility: v.visibility,
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  return { id: sightingRef.id };
});

export const cleanupStaleSightings = onSchedule(
  { schedule: "0 4 * * 0", timeoutSeconds: 300 }, // weekly, Sunday 04:00
  async () => {
    const db = getFirestore();
    const cutoff = Timestamp.fromMillis(Date.now() - STALE_CLEANUP_DAYS * DAY_MS);
    let deleted = 0;

    for (;;) {
      const snap = await db
        .collection("sightings")
        .where("sightingDate", "<", cutoff)
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
    logger.info(`cleanupStaleSightings removed ${deleted} sightings.`);
  }
);
