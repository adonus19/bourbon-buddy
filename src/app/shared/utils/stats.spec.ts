import { Timestamp } from '@angular/fire/firestore';
import { LogEntry } from '../../models';
import {
  activityByMonth,
  agePreference,
  categoryBreakdown,
  computeSummary,
  proofPreference,
  ratingDistribution,
  tastePreference,
  topDistilleries,
  topFlavorTags,
} from './stats';

const ts = (d: Date | null) =>
  (d ? { toDate: () => d } : {}) as unknown as Timestamp;

function entry(over: Partial<LogEntry> = {}): LogEntry {
  return {
    rating: 4,
    distillery: 'Buffalo Trace',
    purchasePrice: 50,
    category: 'bourbon',
    proof: 100,
    ageStatement: 8,
    isNas: false,
    entryDate: ts(new Date('2026-03-15T12:00:00')),
    noseTags: [],
    palateTags: [],
    finishTags: [],
    ...over,
  } as LogEntry;
}

describe('computeSummary', () => {
  it('totals bottles, distilleries, spend, and average rating', () => {
    const s = computeSummary([
      entry({ distillery: 'Buffalo Trace', purchasePrice: 40, rating: 4 }),
      entry({ distillery: 'buffalo trace', purchasePrice: 60, rating: 5 }), // dupe distillery
      entry({ distillery: 'Heaven Hill', purchasePrice: 20, rating: null }),
    ]);
    expect(s.totalBourbons).toBe(3);
    expect(s.totalDistilleries).toBe(2); // case-insensitive dedupe
    expect(s.totalSpent).toBe(120);
    expect(s.avgRating).toBeCloseTo(4.5); // only the two rated entries
  });

  it('reports null average when nothing is rated', () => {
    expect(computeSummary([entry({ rating: null })]).avgRating).toBeNull();
    expect(computeSummary([]).totalBourbons).toBe(0);
  });

  it('counts open and killed owned bottles (BB-194)', () => {
    const s = computeSummary([
      entry({ entryType: 'bottle_purchased', bottleStatus: 'open' }),
      entry({ entryType: 'bottle_purchased', bottleStatus: 'finished' }),
      entry({ entryType: 'gift_received', bottleRemainingPct: 0 }), // legacy → finished
      entry({ entryType: 'drink' }), // non-owned → neither
    ]);
    expect(s.openBottles).toBe(1);
    expect(s.killedBottles).toBe(2);
  });
});

describe('ratingDistribution', () => {
  it('has 10 half-star bins and counts rounded ratings', () => {
    const bins = ratingDistribution([
      entry({ rating: 4 }),
      entry({ rating: 4 }),
      entry({ rating: 3.7 }), // rounds to 3.5
      entry({ rating: null }), // excluded
    ]);
    expect(bins).toHaveLength(10);
    expect(bins.find((b) => b.value === 4)!.count).toBe(2);
    expect(bins.find((b) => b.value === 3.5)!.count).toBe(1);
  });
});

describe('categoryBreakdown', () => {
  it('counts by category, largest first, drops zero counts', () => {
    const slices = categoryBreakdown([
      entry({ category: 'bourbon' }),
      entry({ category: 'bourbon' }),
      entry({ category: 'rye' }),
    ]);
    expect(slices.map((s) => [s.category, s.count])).toEqual([
      ['bourbon', 2],
      ['rye', 1],
    ]);
  });
});

describe('topDistilleries', () => {
  it('ranks by average rating, requiring a minimum entry count', () => {
    const result = topDistilleries([
      entry({ distillery: 'A', rating: 5 }),
      entry({ distillery: 'A', rating: 5 }),
      entry({ distillery: 'B', rating: 3 }),
      entry({ distillery: 'B', rating: 3 }),
      entry({ distillery: 'C', rating: 5 }), // only 1 entry -> excluded
      entry({ distillery: null, rating: 5 }), // no distillery -> skipped
      entry({ distillery: null, rating: 5 }),
    ]);
    expect(result.map((d) => d.name)).toEqual(['A', 'B']);
    expect(result[0].avgRating).toBe(5);
  });
});

describe('proofPreference', () => {
  it('buckets by proof range and averages rating', () => {
    const curve = proofPreference([
      entry({ proof: 90, rating: 4 }), // <=90 bucket 0
      entry({ proof: 95, rating: 3 }), // 91-100 bucket 1
      entry({ proof: 105, rating: 4 }), // 101-110 bucket 2
      entry({ proof: 115, rating: 5 }), // 111-120 bucket 3
      entry({ proof: 130, rating: 5 }), // >120 bucket 4
      entry({ proof: undefined, rating: 5 }), // excluded
    ]);
    expect(curve.totalPoints).toBe(5);
    expect(curve.buckets[0].avg).toBe(4);
    expect(curve.buckets[3].avg).toBe(5);
    expect(curve.buckets[4].avg).toBe(5);
  });
});

describe('agePreference', () => {
  it('puts NAS in its own bucket and ranges the rest', () => {
    const curve = agePreference([
      entry({ isNas: true, rating: 3 }), // bucket 0 (NAS)
      entry({ isNas: false, ageStatement: 4, rating: 4 }), // <6 bucket 1
      entry({ isNas: false, ageStatement: 8, rating: 4 }), // 6-10 bucket 2
      entry({ isNas: false, ageStatement: 12, rating: 5 }), // 11-15 bucket 3
      entry({ isNas: false, ageStatement: 20, rating: 5 }), // >15 bucket 4
      entry({ isNas: false, ageStatement: undefined, rating: 4 }), // excluded
    ]);
    expect(curve.totalPoints).toBe(5);
    expect(curve.buckets[0].avg).toBe(3);
    expect(curve.buckets[3].avg).toBe(5);
    expect(curve.buckets[4].avg).toBe(5);
  });
});

describe('activityByMonth', () => {
  it('places entries into month buckets over the window', () => {
    const now = new Date();
    const result = activityByMonth(
      [
        entry({ entryDate: ts(now) }),
        entry({ entryDate: ts(now) }),
        entry({ entryDate: ts(null) }), // no date -> skipped
      ],
      '3m'
    );
    expect(result).toHaveLength(3); // 2 months back + current
    expect(result[result.length - 1].count).toBe(2);
  });

  it('spans a single bucket for "all" when the earliest is this month', () => {
    const now = new Date();
    const result = activityByMonth([entry({ entryDate: ts(now) })], 'all');
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(1);
  });
});

describe('tastePreference', () => {
  it('averages rating per note above the minimum count, highest first', () => {
    const result = tastePreference([
      entry({ rating: 5, noseTags: ['caramel'], palateTags: ['caramel'] }), // deduped to 1
      entry({ rating: 5, noseTags: ['caramel'] }),
      entry({ rating: 3, palateTags: ['oak'] }), // only 1 -> excluded (min 2)
      entry({ rating: 2, finishTags: ['smoke'] }),
      entry({ rating: 4, finishTags: ['smoke'] }),
    ]);
    const tags = result.map((r) => r.tag);
    expect(tags).toContain('caramel');
    expect(tags).not.toContain('oak'); // below min count
    expect(result.find((r) => r.tag === 'caramel')!.avgRating).toBe(5);
    expect(result[0].tag).toBe('caramel'); // highest avg first
  });
});

describe('topFlavorTags', () => {
  it('counts tags across all stages, ties broken alphabetically', () => {
    const result = topFlavorTags(
      [
        entry({ noseTags: ['oak'], palateTags: ['oak'], finishTags: ['vanilla'] }),
        entry({ noseTags: ['vanilla'], palateTags: ['caramel'] }),
      ],
      2
    );
    expect(result[0]).toEqual({ tag: 'oak', count: 2 });
    expect(result).toHaveLength(2);
    // vanilla (2) should come before caramel (1)
    expect(result[1].tag).toBe('vanilla');
  });
});
