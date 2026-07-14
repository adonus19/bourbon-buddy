/**
 * Community confirmation of sightings (BB-194).
 *
 * Another user who is AT the store can vote "still there" (confirm) or "gone"
 * (dispute). Everything trust-relevant is derived server-side so it can't be
 * spoofed by a crafted request:
 *   - the callable is the only write path (rules deny the votes subcollection
 *     and pin the denormalized counters on the sighting doc);
 *   - App Check (BB-121) + a per-user daily budget gate the endpoint;
 *   - votes require presence: caller coords within CONFIRM_RADIUS_M of the
 *     sighting's own coordinates — a sighting without a location can't be
 *     community-verified at all;
 *   - one vote per user per sighting (doc id = voter uid), self-votes and
 *     non-visible sightings rejected.
 *
 * Freshness interplay (BB-171): a confirm sets `lastConfirmedAt`, which the
 * client treats as the freshness clock. Confirmations extend the badge only
 * within the hard 30-day cleanup window — they never resurrect a sighting the
 * server is about to drop; the right move then is a fresh "Spotted it".
 */
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { isPresenceVerified } from "./presence";
import {
  consumeDailyLimit,
  ENFORCE_APP_CHECK,
  requireApproved,
} from "../shared/guards";

export const DAILY_CONFIRMATION_LIMIT = 20;
// Looser than the spotter's 150 m: this compares two GPS fixes (voter's and
// spotter's), so both fixes' drift stack up.
export const CONFIRM_RADIUS_M = 250;

export type Verdict = "confirm" | "dispute";

export interface VoteInput {
  sightingId?: string;
  verdict?: string;
  lat?: number;
  lng?: number;
}

export interface SightingForVote {
  spotterUid: string;
  visibility?: string;
  lat?: number | null;
  lng?: number | null;
}

/**
 * Pure eligibility check — throws the exact HttpsError the callable surfaces.
 * `isFriend` is injected so this stays unit-testable without Firestore.
 */
export function assessVote(
  voterUid: string,
  sighting: SightingForVote,
  verdict: string | undefined,
  coords: { lat?: number; lng?: number },
  isFriend: boolean
): Verdict {
  if (verdict !== "confirm" && verdict !== "dispute") {
    throw new HttpsError("invalid-argument", "Verdict must be confirm or dispute.");
  }
  if (sighting.spotterUid === voterUid) {
    throw new HttpsError(
      "failed-precondition",
      "You can't confirm your own sighting."
    );
  }
  if (sighting.visibility !== "friends" || !isFriend) {
    // Same shape as "not visible": don't leak whether the sighting exists.
    throw new HttpsError("not-found", "Sighting not found.");
  }
  if (sighting.lat == null || sighting.lng == null) {
    throw new HttpsError(
      "failed-precondition",
      "This sighting has no location, so it can't be verified in person."
    );
  }
  if (
    typeof coords.lat !== "number" ||
    typeof coords.lng !== "number" ||
    !isPresenceVerified(
      { lat: coords.lat, lng: coords.lng },
      { lat: sighting.lat, lng: sighting.lng },
      CONFIRM_RADIUS_M
    )
  ) {
    throw new HttpsError(
      "failed-precondition",
      "You need to be at the store to confirm a sighting."
    );
  }
  return verdict;
}

/** Counter deltas when a voter's verdict is created or changed. */
export function voteDeltas(
  previous: Verdict | null,
  next: Verdict
): { confirm: number; dispute: number } {
  if (previous === next) {
    return { confirm: 0, dispute: 0 };
  }
  const delta = { confirm: 0, dispute: 0 };
  if (previous) {
    delta[previous] -= 1;
  }
  delta[next] += 1;
  return delta;
}

export const confirmSighting = onCall(
  { region: "us-central1", enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) => {
    const uid = requireApproved(request);
    const d = (request.data ?? {}) as VoteInput;
    if (!d.sightingId || typeof d.sightingId !== "string") {
      throw new HttpsError("invalid-argument", "A sighting id is required.");
    }

    const db = getFirestore();
    const sightingRef = db.doc(`sightings/${d.sightingId}`);
    const snap = await sightingRef.get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "Sighting not found.");
    }
    const sighting = snap.data() as SightingForVote;

    const friendSnap = await db
      .doc(`users/${sighting.spotterUid}/friends/${uid}`)
      .get();
    const verdict = assessVote(
      uid,
      sighting,
      d.verdict,
      { lat: d.lat, lng: d.lng },
      friendSnap.exists
    );

    await consumeDailyLimit(
      db,
      uid,
      "sightingConfirmations",
      DAILY_CONFIRMATION_LIMIT,
      "Daily confirmation limit reached. Try again tomorrow."
    );

    const voteRef = sightingRef.collection("votes").doc(uid);
    const changed = await db.runTransaction(async (tx) => {
      const voteSnap = await tx.get(voteRef);
      const previous = (voteSnap.data()?.verdict as Verdict | undefined) ?? null;
      const delta = voteDeltas(previous, verdict);
      if (delta.confirm === 0 && delta.dispute === 0) {
        return false; // idempotent re-vote
      }
      tx.set(voteRef, {
        voterUid: uid,
        verdict,
        votedAt: FieldValue.serverTimestamp(),
      });
      const update: Record<string, unknown> = {
        confirmCount: FieldValue.increment(delta.confirm),
        disputeCount: FieldValue.increment(delta.dispute),
      };
      if (verdict === "confirm") {
        update["lastConfirmedAt"] = FieldValue.serverTimestamp();
      }
      tx.update(sightingRef, update);
      return true;
    });

    if (changed) {
      logger.info(`Sighting ${d.sightingId}: ${verdict} by ${uid}.`);
    }
    return { verdict, changed };
  }
);
