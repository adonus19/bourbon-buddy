import { Timestamp } from '@angular/fire/firestore';

import { CriticSignal } from '../../models';
import { summarizeCriticSignals } from './critic-signals';

const signal = (over: Partial<CriticSignal> = {}): CriticSignal => ({
  score: null,
  verdict: null,
  sourceName: 'Whiskey Advocate',
  at: Timestamp.fromMillis(1000),
  ...over,
});

const map = (...signals: CriticSignal[]): Record<string, CriticSignal> =>
  Object.fromEntries(signals.map((s, i) => [`a${i}`, s]));

describe('summarizeCriticSignals (BB-221)', () => {
  it('returns an empty summary for null / no signals', () => {
    for (const input of [null, undefined, {}]) {
      const s = summarizeCriticSignals(input);
      expect(s.total).toBe(0);
      expect(s.average).toBeNull();
      expect(s.scoreCount).toBe(0);
      expect(s.verdictCounts).toEqual({
        rave: 0,
        positive: 0,
        mixed: 0,
        negative: 0,
      });
    }
  });

  it('counts each verdict as words', () => {
    const s = summarizeCriticSignals(
      map(
        signal({ verdict: 'rave' }),
        signal({ verdict: 'rave' }),
        signal({ verdict: 'positive' }),
        signal({ verdict: 'mixed' })
      )
    );
    expect(s.total).toBe(4);
    expect(s.verdictCounts).toEqual({
      rave: 2,
      positive: 1,
      mixed: 1,
      negative: 0,
    });
  });

  it('averages scores only when at least two are present', () => {
    const one = summarizeCriticSignals(map(signal({ score: 92 })));
    expect(one.scoreCount).toBe(1);
    expect(one.average).toBeNull(); // no numeric average below 2 scores

    const two = summarizeCriticSignals(
      map(signal({ score: 92 }), signal({ score: 88 }))
    );
    expect(two.scoreCount).toBe(2);
    expect(two.average).toBe(90);
  });

  it('rounds the average and ignores null scores in the mean', () => {
    const s = summarizeCriticSignals(
      map(
        signal({ score: 91, verdict: 'positive' }),
        signal({ score: 94, verdict: 'rave' }),
        signal({ score: null, verdict: 'mixed' }) // verdict-only, no score
      )
    );
    expect(s.total).toBe(3);
    expect(s.scoreCount).toBe(2);
    expect(s.average).toBe(93); // round((91+94)/2) = 92.5 → 93
  });
});
