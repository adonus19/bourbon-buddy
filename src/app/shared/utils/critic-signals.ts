import { CriticSignal } from '../../models';

/**
 * Critic-signal aggregation for display (BB-221).
 *
 * `/bourbons/{id}.criticSignals` is a per-article map (verdict from BB-220,
 * normalized 0-100 score from BB-221). Nothing summed is stored server-side, so
 * the summary is derived here on read. Pure — safe in a computed(). The
 * numeric average is withheld below two scores: one critic's number isn't a
 * consensus, and a lone "92" reads as more authority than it has.
 */

export type Verdict = 'rave' | 'positive' | 'mixed' | 'negative';

const VERDICTS: readonly Verdict[] = ['rave', 'positive', 'mixed', 'negative'];

/** Minimum scores before a numeric average is meaningful enough to show. */
export const MIN_SCORES_FOR_AVERAGE = 2;

export interface CriticSummary {
  /** Total signals (any with a verdict or a score). */
  total: number;
  /** Count per verdict word. */
  verdictCounts: Record<Verdict, number>;
  /** Mean of the present scores, rounded — null below MIN_SCORES_FOR_AVERAGE. */
  average: number | null;
  /** How many signals carried a numeric score. */
  scoreCount: number;
}

export function summarizeCriticSignals(
  signals: Record<string, CriticSignal> | null | undefined
): CriticSummary {
  const verdictCounts: Record<Verdict, number> = {
    rave: 0,
    positive: 0,
    mixed: 0,
    negative: 0,
  };
  const entries = signals ? Object.values(signals) : [];

  let scoreSum = 0;
  let scoreCount = 0;
  for (const s of entries) {
    if (s.verdict && VERDICTS.includes(s.verdict as Verdict)) {
      verdictCounts[s.verdict as Verdict]++;
    }
    if (typeof s.score === 'number') {
      scoreSum += s.score;
      scoreCount++;
    }
  }

  return {
    total: entries.length,
    verdictCounts,
    scoreCount,
    average:
      scoreCount >= MIN_SCORES_FOR_AVERAGE
        ? Math.round(scoreSum / scoreCount)
        : null,
  };
}
