/**
 * Taste vector math (BB-199) — server mirror of the client's
 * `src/app/shared/utils/taste-match.ts`. Keep the two in step: same rating
 * floor, cold-start gate, and per-stage occurrence counts, or client badges
 * and server alerts will disagree about what "matches your taste" means.
 */

export const LIKE_RATING_MIN = 4;
export const MIN_LIKED_ENTRIES = 3;
export const MATCH_MIN_SCORE = 3;
export const MATCH_MIN_TAGS = 2;

const W_PALATE = 2;
const W_NOSE = 1;
const W_FINISH = 1;

export interface TasteVector {
  nose: Record<string, number>;
  palate: Record<string, number>;
  finish: Record<string, number>;
  basedOnEntries: number;
}

export interface TaggedEntry {
  rating?: number | null;
  noseTags?: unknown;
  palateTags?: unknown;
  finishTags?: unknown;
}

interface StageTags {
  nose: string[];
  palate: string[];
  finish: string[];
}

const tags = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((t): t is string => typeof t === "string") : [];

/** Builds the vector from liked (rating ≥ 4), tagged entries; null when cold. */
export function buildTasteVector(entries: TaggedEntry[]): TasteVector | null {
  const likedEntries = entries.filter((e) => {
    const rated = typeof e.rating === "number" && e.rating >= LIKE_RATING_MIN;
    const tagged =
      tags(e.noseTags).length + tags(e.palateTags).length + tags(e.finishTags).length > 0;
    return rated && tagged;
  });
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
    for (const t of tags(e.noseTags)) {
      vector.nose[t] = (vector.nose[t] ?? 0) + 1;
    }
    for (const t of tags(e.palateTags)) {
      vector.palate[t] = (vector.palate[t] ?? 0) + 1;
    }
    for (const t of tags(e.finishTags)) {
      vector.finish[t] = (vector.finish[t] ?? 0) + 1;
    }
  }
  return vector;
}

/** Same matching rule the client badge uses; powers 4b alert decisions. */
export function matchTaste(
  vector: TasteVector | null | undefined,
  stageTags: StageTags | null | undefined
): { matched: boolean; tags: string[] } {
  if (!vector || !stageTags) {
    return { matched: false, tags: [] };
  }
  const hits: { tag: string; weight: number; score: number }[] = [];
  const collect = (
    list: string[],
    stageVector: Record<string, number>,
    stageWeight: number
  ): void => {
    for (const tag of list) {
      const weight = stageVector[tag];
      if (weight && !hits.some((h) => h.tag === tag)) {
        hits.push({ tag, weight, score: stageWeight });
      }
    }
  };
  collect(stageTags.palate, vector.palate, W_PALATE);
  collect(stageTags.nose, vector.nose, W_NOSE);
  collect(stageTags.finish, vector.finish, W_FINISH);

  const score = hits.reduce((sum, h) => sum + h.score, 0);
  const matched = score >= MATCH_MIN_SCORE && hits.length >= MATCH_MIN_TAGS;
  hits.sort((a, b) => b.weight - a.weight || b.score - a.score);
  return { matched, tags: matched ? hits.map((h) => h.tag) : [] };
}
