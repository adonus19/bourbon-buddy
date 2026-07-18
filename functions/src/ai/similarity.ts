/**
 * "Similar bottles" neighbor computation (BB-197).
 *
 * Pure tag math over the canonical flavor profiles — no model calls, ever.
 * Neighbor lists are precomputed server-side and cached on each `/bourbons`
 * doc (`similarBottles`), so displaying recommendations costs the client
 * nothing beyond the bottle doc it already reads. Recomputation is tied to
 * profile changes via a staleness marker, not a schedule of blind rescans.
 */
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";

import { FlavorTags, hasAnyTags, blendedProfileTags } from "./flavor-enrichment";

// Palate agreement says more about whether you'd like a pour than nose or
// finish; same-category pairs get a mild nudge without silencing cross-
// category discoveries.
const W_PALATE = 2;
const W_NOSE = 1;
const W_FINISH = 1;
const SAME_CATEGORY_BOOST = 1.15;

// One shared palate tag alone (2, boosted 2.3) is noise, not similarity; a
// palate tag plus anything else clears the floor.
export const MIN_SIMILARITY_SCORE = 3;
export const MAX_NEIGHBORS = 6;
const MAX_SHARED_TAGS = 6;

export interface BottleForSimilarity {
  id: string;
  name: string;
  category?: string | null;
  tags: FlavorTags;
}

/** Denormalized neighbor entry cached on the bourbon doc. */
export interface SimilarBottle {
  bourbonId: string;
  name: string;
  category: string | null;
  sharedTags: string[];
}

const intersect = (a: string[], b: string[]): string[] => {
  const set = new Set(b);
  return a.filter((t) => set.has(t));
};

/** Weighted tag-overlap score plus the shared tags (palate-first) behind it. */
export function similarityScore(
  a: BottleForSimilarity,
  b: BottleForSimilarity
): { score: number; sharedTags: string[] } {
  const palate = intersect(a.tags.palate, b.tags.palate);
  const nose = intersect(a.tags.nose, b.tags.nose);
  const finish = intersect(a.tags.finish, b.tags.finish);

  let score = W_PALATE * palate.length + W_NOSE * nose.length + W_FINISH * finish.length;
  if (score > 0 && a.category && b.category && a.category === b.category) {
    score *= SAME_CATEGORY_BOOST;
  }

  const sharedTags: string[] = [];
  for (const t of [...palate, ...nose, ...finish]) {
    if (!sharedTags.includes(t)) {
      sharedTags.push(t);
    }
  }
  return { score, sharedTags: sharedTags.slice(0, MAX_SHARED_TAGS) };
}

/**
 * All-pairs neighbor lists: for each bottle, its top MAX_NEIGHBORS above the
 * similarity floor, best first (name as a stable tie-break). O(n²) pairs is
 * trivial at catalog scale (hundreds) and runs entirely in memory.
 */
export function computeNeighbors(
  bottles: BottleForSimilarity[]
): Map<string, SimilarBottle[]> {
  const scored = new Map<
    string,
    { score: number; neighbor: BottleForSimilarity; sharedTags: string[] }[]
  >();
  for (const b of bottles) {
    scored.set(b.id, []);
  }

  for (let i = 0; i < bottles.length; i++) {
    for (let j = i + 1; j < bottles.length; j++) {
      const a = bottles[i];
      const b = bottles[j];
      const { score, sharedTags } = similarityScore(a, b);
      if (score < MIN_SIMILARITY_SCORE) {
        continue;
      }
      scored.get(a.id)?.push({ score, neighbor: b, sharedTags });
      scored.get(b.id)?.push({ score, neighbor: a, sharedTags });
    }
  }

  const result = new Map<string, SimilarBottle[]>();
  for (const [id, list] of scored) {
    list.sort(
      (x, y) => y.score - x.score || x.neighbor.name.localeCompare(y.neighbor.name)
    );
    result.set(
      id,
      list.slice(0, MAX_NEIGHBORS).map(({ neighbor, sharedTags }) => ({
        bourbonId: neighbor.id,
        name: neighbor.name,
        category: neighbor.category ?? null,
        sharedTags,
      }))
    );
  }
  return result;
}

// ---------------------------------------------------------------------------
// Firestore integration: staleness-gated recompute, called after enrichment
// work (sweep/backfill) rather than on a blind schedule.
// ---------------------------------------------------------------------------

const MARKER_PATH = "meta/similarity";

const sameNeighbors = (a: SimilarBottle[], b: SimilarBottle[]): boolean =>
  a.length === b.length &&
  a.every(
    (x, i) =>
      x.bourbonId === b[i].bourbonId &&
      x.sharedTags.length === b[i].sharedTags.length &&
      x.sharedTags.every((t, k) => t === b[i].sharedTags[k])
  );

/**
 * Recomputes every bottle's `similarBottles` when any profile changed since
 * the last run. Cost profile: 1 read when nothing changed; one collection
 * read + only-changed writes otherwise. Never throws — recommendations are
 * best-effort and must not fail the enrichment that triggered them.
 */
export async function recomputeNeighborsIfStale(
  db: FirebaseFirestore.Firestore
): Promise<{ status: "fresh" | "recomputed" | "failed"; updated: number }> {
  try {
    const latest = await db
      .collection("bourbons")
      .orderBy("flavorEnrichedAt", "desc")
      .limit(1)
      .get();
    const latestAt = latest.docs[0]?.get("flavorEnrichedAt") as
      | Timestamp
      | undefined;
    if (!latestAt) {
      return { status: "fresh", updated: 0 };
    }
    const markerRef = db.doc(MARKER_PATH);
    const marker = await markerRef.get();
    const computedAt = marker.get("computedAt") as Timestamp | undefined;
    if (computedAt && latestAt.toMillis() <= computedAt.toMillis()) {
      return { status: "fresh", updated: 0 };
    }

    const snap = await db.collection("bourbons").get();
    const eligible: BottleForSimilarity[] = [];
    const existing = new Map<string, SimilarBottle[]>();
    for (const doc of snap.docs) {
      const data = doc.data();
      if (data.canonicalId) {
        continue; // merged duplicate — never recommend it
      }
      // Blend in the BB-188 community tier so neighbors reflect what tasters
      // confirmed, not just reviews/AI. Community changes land on the next
      // enrichment-driven recompute (this gate keys off flavorEnrichedAt).
      const tags = blendedProfileTags(data.flavorProfile);
      if (!hasAnyTags(tags)) {
        continue;
      }
      eligible.push({
        id: doc.id,
        name: (data.name as string) ?? doc.id,
        category: (data.category as string | null) ?? null,
        tags,
      });
      existing.set(
        doc.id,
        Array.isArray(data.similarBottles)
          ? (data.similarBottles as SimilarBottle[])
          : []
      );
    }

    const neighbors = computeNeighbors(eligible);
    let updated = 0;
    let batch = db.batch();
    let ops = 0;
    for (const [id, list] of neighbors) {
      if (sameNeighbors(existing.get(id) ?? [], list)) {
        continue;
      }
      batch.update(db.collection("bourbons").doc(id), {
        similarBottles: list,
        similarComputedAt: FieldValue.serverTimestamp(),
      });
      updated++;
      ops++;
      if (ops >= 400) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }
    if (ops > 0) {
      await batch.commit();
    }
    await markerRef.set({ computedAt: latestAt }, { merge: true });
    logger.info(
      `Similarity recompute: ${eligible.length} eligible, ${updated} updated.`
    );
    return { status: "recomputed", updated };
  } catch (err) {
    logger.warn("Similarity recompute failed (best-effort, skipped)", err);
    return { status: "failed", updated: 0 };
  }
}
