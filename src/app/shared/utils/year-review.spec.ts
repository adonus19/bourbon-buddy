import { buildYearReview, yearsWithData } from './year-review';

type EntryLike = Parameters<typeof buildYearReview>[0][number];

let n = 0;
const entry = (over: Partial<EntryLike> = {}): EntryLike => ({
  bourbonId: `b${n}`,
  bourbonName: `Bottle ${n++}`,
  entryType: 'bottle_purchased',
  entryDate: { toDate: () => new Date('2026-03-15T12:00:00Z') },
  rating: null,
  purchasePrice: null,
  valueScore: null,
  noseTags: [],
  palateTags: [],
  finishTags: [],
  ...over,
});

const inYear = (iso: string, over: Partial<EntryLike> = {}): EntryLike =>
  entry({ entryDate: { toDate: () => new Date(iso) }, ...over });

describe('yearsWithData (BB-200)', () => {
  it('lists distinct years, newest first', () => {
    const years = yearsWithData([
      inYear('2024-06-01T12:00:00Z'),
      inYear('2026-01-05T12:00:00Z'),
      inYear('2026-11-20T12:00:00Z'),
    ]);
    expect(years).toEqual([2026, 2024]);
  });
});

describe('buildYearReview (BB-200)', () => {
  it('returns null for a year with no entries', () => {
    expect(buildYearReview([inYear('2025-01-01T12:00:00Z')], 2026)).toBeNull();
  });

  it('computes counts, spend, and unique bottles for the year only', () => {
    const review = buildYearReview(
      [
        inYear('2026-01-10T12:00:00Z', { bourbonId: 'a', purchasePrice: 40 }),
        inYear('2026-02-10T12:00:00Z', { bourbonId: 'a', purchasePrice: 45 }),
        inYear('2026-03-10T12:00:00Z', { bourbonId: 'b', purchasePrice: null }),
        inYear('2025-03-10T12:00:00Z', { bourbonId: 'c', purchasePrice: 999 }),
      ],
      2026
    );
    expect(review?.entryCount).toBe(3);
    expect(review?.uniqueBottles).toBe(2);
    expect(review?.totalSpent).toBe(85);
  });

  it('finds the top category, top-rated bottle, and best value', () => {
    const review = buildYearReview(
      [
        inYear('2026-01-01T12:00:00Z', {
          category: 'rye',
          bourbonName: 'Sazerac',
          rating: 4.5,
          valueScore: 2.1,
        }),
        inYear('2026-02-01T12:00:00Z', {
          category: 'bourbon',
          bourbonName: 'Weller 12',
          rating: 5,
          valueScore: 3.3,
        }),
        inYear('2026-03-01T12:00:00Z', {
          category: 'bourbon',
          bourbonName: 'Meh',
          rating: 2,
          valueScore: 0.4,
        }),
      ],
      2026
    );
    expect(review?.topCategory).toEqual({ category: 'bourbon', count: 2 });
    expect(review?.topBottle).toEqual({ name: 'Weller 12', rating: 5 });
    expect(review?.bestValue?.name).toBe('Weller 12');
    expect(review?.avgRating).toBeCloseTo(3.8, 1);
  });

  it('aggregates the top flavor tags across stages and the busiest month', () => {
    const review = buildYearReview(
      [
        inYear('2026-05-01T12:00:00Z', {
          palateTags: ['Cherry', 'Oak'],
          noseTags: ['Cherry'],
        }),
        inYear('2026-05-20T12:00:00Z', { palateTags: ['Cherry'] }),
        inYear('2026-07-04T12:00:00Z', { finishTags: ['Oak'] }),
      ],
      2026
    );
    expect(review?.topTags[0]).toEqual({ tag: 'Cherry', count: 3 });
    expect(review?.topTags[1]).toEqual({ tag: 'Oak', count: 2 });
    expect(review?.busiestMonth).toEqual({ month: 4, count: 2 }); // May
  });

  it('leaves optional stats null when the data never existed', () => {
    const review = buildYearReview([inYear('2026-06-01T12:00:00Z')], 2026);
    expect(review?.topCategory).toBeNull();
    expect(review?.topBottle).toBeNull();
    expect(review?.bestValue).toBeNull();
    expect(review?.avgRating).toBeNull();
    expect(review?.topTags).toEqual([]);
  });
});
