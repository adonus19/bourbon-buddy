/**
 * Taste Match (BB-199) — server-side taste vector maintenance.
 *
 * The client derives the same vector from its loaded entries for instant
 * badges; THIS copy exists so sighting-time alert matching (BB-199 pass 4b)
 * can read a friend's taste without touching their private entries. Trigger:
 * any log-entry write recomputes the vector from that user's entries and
 * stores it on their /users/{uid} profile doc — a handful of reads per
 * user-initiated save, no model calls, no schedules.
 */
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { onDocumentWritten } from "firebase-functions/v2/firestore";

import { buildTasteVector, TaggedEntry, TasteVector } from "./taste-vector";

const sameVector = (a: TasteVector | null, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b ?? null);

export const onLogEntryWrittenUpdateTaste = onDocumentWritten(
  { document: "users/{userId}/logEntries/{entryId}", region: "us-central1" },
  async (event) => {
    const uid = event.params.userId;
    const db = getFirestore();
    try {
      const entries = await db
        .collection(`users/${uid}/logEntries`)
        .select("rating", "noseTags", "palateTags", "finishTags")
        .get();
      const vector = buildTasteVector(
        entries.docs.map((d) => d.data() as TaggedEntry)
      );

      const userRef = db.doc(`users/${uid}`);
      const current = (await userRef.get()).get("tasteVector") ?? null;
      if (sameVector(vector, current)) {
        return; // rating/tag-irrelevant edit — skip the write
      }
      await userRef.update({
        tasteVector: vector ?? FieldValue.delete(),
        tasteVectorUpdatedAt: FieldValue.serverTimestamp(),
      });
      logger.info(
        `Taste vector ${vector ? `updated (${vector.basedOnEntries} entries)` : "cleared"} for ${uid}.`
      );
    } catch (err) {
      // Best-effort: a failed vector refresh must never break entry saves.
      logger.warn(`Taste vector update failed for ${uid}`, err);
    }
  }
);
