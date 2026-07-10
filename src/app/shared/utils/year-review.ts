import { BourbonCategory } from '../../models';

/**
 * Year in Review (BB-200) — pure aggregation over the user's log entries.
 * Computed entirely from the already-loaded entries signal: no reads, nothing
 * stored. Pour sessions live in per-entry subcollections (not loaded
 * globally), so pours are deliberately out of scope.
 */

interface ReviewEntry {
  bourbonId: string;
  bourbonName: string;
  category?: BourbonCategory | null;
  entryType: string;
  entryDate: { toDate(): Date };
  rating?: number | null;
  purchasePrice?: number | null;
  valueScore?: number | null;
  noseTags: string[];
  palateTags: string[];
  finishTags: string[];
}

export interface YearReview {
  year: number;
  entryCount: number;
  uniqueBottles: number;
  totalSpent: number;
  topCategory: { category: BourbonCategory; count: number } | null;
  avgRating: number | null;
  topBottle: { name: string; rating: number } | null;
  bestValue: { name: string; valueScore: number } | null;
  topTags: { tag: string; count: number }[];
  busiestMonth: { month: number; count: number } | null; // 0-based month
}

const TOP_TAGS = 5;

/** Distinct years that have at least one entry, newest first. */
export function yearsWithData(entries: ReviewEntry[]): number[] {
  const years = new Set(entries.map((e) => e.entryDate.toDate().getFullYear()));
  return [...years].sort((a, b) => b - a);
}

/** Aggregates one calendar year of entries, or null when the year is empty. */
export function buildYearReview(
  entries: ReviewEntry[],
  year: number
): YearReview | null {
  const inYear = entries.filter(
    (e) => e.entryDate.toDate().getFullYear() === year
  );
  if (inYear.length === 0) {
    return null;
  }

  const categories = new Map<BourbonCategory, number>();
  const tags = new Map<string, number>();
  const months = new Map<number, number>();
  let totalSpent = 0;
  let ratingSum = 0;
  let ratingCount = 0;
  let topBottle: { name: string; rating: number } | null = null;
  let bestValue: { name: string; valueScore: number } | null = null;

  for (const e of inYear) {
    if (e.category) {
      categories.set(e.category, (categories.get(e.category) ?? 0) + 1);
    }
    for (const t of [...e.noseTags, ...e.palateTags, ...e.finishTags]) {
      tags.set(t, (tags.get(t) ?? 0) + 1);
    }
    const month = e.entryDate.toDate().getMonth();
    months.set(month, (months.get(month) ?? 0) + 1);
    if (typeof e.purchasePrice === 'number') {
      totalSpent += e.purchasePrice;
    }
    if (typeof e.rating === 'number') {
      ratingSum += e.rating;
      ratingCount++;
      if (!topBottle || e.rating > topBottle.rating) {
        topBottle = { name: e.bourbonName, rating: e.rating };
      }
    }
    if (typeof e.valueScore === 'number') {
      if (!bestValue || e.valueScore > bestValue.valueScore) {
        bestValue = { name: e.bourbonName, valueScore: e.valueScore };
      }
    }
  }

  const best = <K>(m: Map<K, number>): { key: K; count: number } | null => {
    let out: { key: K; count: number } | null = null;
    for (const [key, count] of m) {
      if (!out || count > out.count) {
        out = { key, count };
      }
    }
    return out;
  };

  const topCategory = best(categories);
  const busiestMonth = best(months);
  return {
    year,
    entryCount: inYear.length,
    uniqueBottles: new Set(inYear.map((e) => e.bourbonId)).size,
    totalSpent,
    topCategory: topCategory
      ? { category: topCategory.key, count: topCategory.count }
      : null,
    avgRating: ratingCount ? ratingSum / ratingCount : null,
    topBottle,
    bestValue,
    topTags: [...tags.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
      .slice(0, TOP_TAGS),
    busiestMonth: busiestMonth
      ? { month: busiestMonth.key, count: busiestMonth.count }
      : null,
  };
}
