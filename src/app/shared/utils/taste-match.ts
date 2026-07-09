/**
 * Taste Match (BB-199) — pure math, shared by every badge surface.
 *
 * The taste vector is built from the user's OWN tasting tags on entries they
 * rated highly (what they personally tasted and liked), not from AI profiles.
 * The client derives it from the already-loaded entries signal (zero reads);
 * the server maintains an identical copy on the profile doc (functions/src/
 * taste) for sighting alerts. Keep the two implementations in step.
 *
 * Matching uses the same stage weights as Similar Bottles (BB-197): palate
 * agreement says the most about whether you'd like a pour.
 */

/** Rating floor for an entry to count as "liked". */
export const LIKE_RATING_MIN = 4;
/** Cold start: below this many liked+tagged entries there is no vector. */
export const MIN_LIKED_ENTRIES = 3;
/** Weighted score floor — one palate tag alone (2) is noise, not a match. */
export const MATCH_MIN_SCORE = 3;
/** And at least two distinct shared tags, so a match always explains itself. */
export const MATCH_MIN_TAGS = 2;

const W_PALATE = 2;
const W_NOSE = 1;
const W_FINISH = 1;

/** Per-stage tag → occurrence count across the user's liked entries. */
export interface TasteVector {
  nose: Record<string, number>;
  palate: Record<string, number>;
  finish: Record<string, number>;
  basedOnEntries: number;
}

interface TaggedEntry {
  rating?: number | null;
  noseTags: string[];
  palateTags: string[];
  finishTags: string[];
}

interface StageTags {
  nose: string[];
  palate: string[];
  finish: string[];
}

const hasTags = (e: TaggedEntry): boolean =>
  e.noseTags.length + e.palateTags.length + e.finishTags.length > 0;

/**
 * Builds the vector from liked (rating ≥ 4), tagged entries, or null while
 * cold-starting. Likes-only v1 — dislikes deliberately don't down-weight.
 */
export function buildTasteVector(entries: TaggedEntry[]): TasteVector | null {
  const likedEntries = entries.filter(
    (e) => (e.rating ?? 0) >= LIKE_RATING_MIN && hasTags(e)
  );
  if (likedEntries.length < MIN_LIKED_ENTRIES) {
    return null;
  }
  const vector: TasteVector = {
    nose: {},
    palate: {},
    finish: {},
    basedOnEntries: likedEntries.length,
  };
  for (const e of likedEntries) {
    for (const t of e.noseTags) {
      vector.nose[t] = (vector.nose[t] ?? 0) + 1;
    }
    for (const t of e.palateTags) {
      vector.palate[t] = (vector.palate[t] ?? 0) + 1;
    }
    for (const t of e.finishTags) {
      vector.finish[t] = (vector.finish[t] ?? 0) + 1;
    }
  }
  return vector;
}

/**
 * Whether a bottle's flavor tags match the user's taste, with the shared tags
 * (strongest preference first) so the badge can say why.
 */
export function matchTaste(
  vector: TasteVector | null | undefined,
  tags: StageTags | null | undefined
): { matched: boolean; tags: string[] } {
  if (!vector || !tags) {
    return { matched: false, tags: [] };
  }
  const hits: { tag: string; weight: number; score: number }[] = [];
  const collect = (
    stageTags: string[],
    stageVector: Record<string, number>,
    stageWeight: number
  ): void => {
    for (const tag of stageTags) {
      const weight = stageVector[tag];
      if (weight && !hits.some((h) => h.tag === tag)) {
        hits.push({ tag, weight, score: stageWeight });
      }
    }
  };
  collect(tags.palate, vector.palate, W_PALATE);
  collect(tags.nose, vector.nose, W_NOSE);
  collect(tags.finish, vector.finish, W_FINISH);

  const score = hits.reduce((sum, h) => sum + h.score, 0);
  const matched = score >= MATCH_MIN_SCORE && hits.length >= MATCH_MIN_TAGS;
  hits.sort((a, b) => b.weight - a.weight || b.score - a.score);
  return { matched, tags: matched ? hits.map((h) => h.tag) : [] };
}
