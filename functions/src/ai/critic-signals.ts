/**
 * Critic signals on the catalog (BB-220/221).
 *
 * `/bourbons/{id}.criticSignals` is a map keyed by **articleId** (sha1 hex —
 * safe as a field path) holding what each article said about the bottle:
 * verdict now (BB-220), normalized score later (BB-221). Keying by articleId
 * makes writes idempotent under re-extraction — an article can only ever
 * overwrite its own entry, never double-count. Aggregation (counts, averages)
 * is derived client-side; nothing summed is stored.
 */

/** Anything Timestamp-like; keeps the helper pure and test-friendly. */
interface HasMillis {
  toMillis: () => number;
}

export interface CriticSignal {
  score: number | null; // normalized 0-100 (BB-221); null until then
  verdict: string | null; // rave | positive | mixed | negative (BB-220)
  sourceName: string;
  at: HasMillis;
}

// Enough for honest aggregates; one Firestore map field stays tiny.
export const CRITIC_SIGNALS_CAP = 20;

/**
 * Returns a new map with the article's entry upserted and the oldest entries
 * evicted beyond `cap`. An existing score survives a score-less update (a
 * verdict-only re-extraction must not clobber a BB-221 score). The updated
 * entry itself is never evicted.
 */
export function upsertCriticSignal(
  existing: Record<string, CriticSignal>,
  articleId: string,
  entry: CriticSignal,
  cap = CRITIC_SIGNALS_CAP
): Record<string, CriticSignal> {
  const next: Record<string, CriticSignal> = { ...existing };
  next[articleId] = {
    ...entry,
    score: entry.score ?? existing[articleId]?.score ?? null,
  };

  const overflow = Object.keys(next).length - cap;
  if (overflow > 0) {
    const evictable = Object.keys(next)
      .filter((id) => id !== articleId)
      .sort((a, b) => next[a].at.toMillis() - next[b].at.toMillis());
    for (const id of evictable.slice(0, overflow)) {
      delete next[id];
    }
  }
  return next;
}
