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

const DAILY_SIGHTING_LIMIT = 40;
const STORE_MAX = 120;
const TEXT_MAX = 80;
const NOTES_MAX = 500;
const PRICE_CEILING = 100000;
const STALE_CLEANUP_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

interface LogSightingData {
  bourbonId?: string;
  bourbonName?: string | null;
  storeName?: string;
  price?: number;
  sightingDateMillis?: number;
  city?: string | null;
  state?: string | null;
  notes?: string | null;
  visibility?: string;
}

function bad(message: string): never {
  throw new HttpsError("invalid-argument", message);
}

function validate(d: LogSightingData): Required<
  Pick<LogSightingData, "bourbonId" | "storeName" | "price">
> & {
  sightingDateMillis: number;
  visibility: string;
} {
  if (!d.bourbonId || typeof d.bourbonId !== "string") {
    bad("A bottle is required.");
  }
  if (
    !d.storeName ||
    typeof d.storeName !== "string" ||
    d.storeName.length > STORE_MAX
  ) {
    bad("Store name is required and must be under 120 characters.");
  }
  if (typeof d.price !== "number" || !(d.price > 0) || d.price > PRICE_CEILING) {
    bad("Price must be a positive number under 100,000.");
  }
  const when =
    typeof d.sightingDateMillis === "number" ? d.sightingDateMillis : Date.now();
  if (when > Date.now() + DAY_MS) {
    bad("Sighting date can't be in the future.");
  }
  for (const [field, max] of [
    [d.city, TEXT_MAX],
    [d.state, TEXT_MAX],
    [d.notes, NOTES_MAX],
  ] as const) {
    if (field != null && (typeof field !== "string" || field.length > max)) {
      bad("A field is too long.");
    }
  }
  const visibility = d.visibility === "friends" ? "friends" : "private";
  return {
    bourbonId: d.bourbonId as string,
    storeName: d.storeName as string,
    price: d.price as number,
    sightingDateMillis: when,
    visibility,
  };
}

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
