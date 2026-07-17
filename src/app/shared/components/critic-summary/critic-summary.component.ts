import { Component, computed, input } from '@angular/core';

import { CriticSignal } from '../../../models';
import { Verdict, summarizeCriticSignals } from '../../utils/critic-signals';

/** A verdict word to render, with its count and the correct singular/plural. */
interface VerdictPhrase {
  key: Verdict; // stable for styling + @for tracking
  count: number;
  label: string;
}

// Display order (best → worst) and singular/plural word per verdict.
const VERDICT_WORDS: Record<Verdict, [string, string]> = {
  rave: ['rave', 'raves'],
  positive: ['positive', 'positive'],
  mixed: ['mixed', 'mixed'],
  negative: ['negative', 'negative'],
};
const VERDICT_ORDER: readonly Verdict[] = ['rave', 'positive', 'mixed', 'negative'];

/**
 * Critic summary (BB-221) for a bottle's detail surfaces — the wishlist detail
 * page and the shared preview sheet (Dispatch + Hunt List lookup).
 *
 * Purely presentational: it takes the `criticSignals` map its parent already
 * loaded with the bourbon doc and derives everything with pure `computed()`s —
 * ZERO reads, zero listeners of its own. Renders nothing when there are no
 * signals. The numeric average is withheld below two scores (a single printed
 * number isn't a consensus); verdicts always show as words.
 */
@Component({
  selector: 'app-critic-summary',
  templateUrl: './critic-summary.component.html',
  styleUrls: ['./critic-summary.component.scss'],
  standalone: false,
})
export class CriticSummaryComponent {
  readonly signals = input<Record<string, CriticSignal> | null | undefined>(null);

  private readonly summary = computed(() =>
    summarizeCriticSignals(this.signals())
  );

  /** Anything worth rendering at all. */
  readonly hasData = computed(() => this.summary().total > 0);

  /** Mean score, or null below the 2-score floor. */
  readonly average = computed(() => this.summary().average);
  readonly scoreCount = computed(() => this.summary().scoreCount);

  /** Non-zero verdicts as words, best → worst. */
  readonly verdictPhrases = computed<VerdictPhrase[]>(() => {
    const counts = this.summary().verdictCounts;
    return VERDICT_ORDER.filter((v) => counts[v] > 0).map((v) => ({
      key: v,
      count: counts[v],
      label: VERDICT_WORDS[v][counts[v] === 1 ? 0 : 1],
    }));
  });
}
