import { LogEntry } from '../../models';
import { BourbonCategory } from '../../models';
import { CATEGORY_DISPLAY } from '../constants/category-display';

/** Headline numbers for the top of the stats page. */
export interface SummaryStats {
  totalBourbons: number;
  totalDistilleries: number;
  totalSpent: number;
  avgRating: number | null;
}

export interface RatingBin {
  /** Half-star value, e.g. 0.5 … 5.0. */
  value: number;
  label: string;
  count: number;
}

export interface CategorySlice {
  category: BourbonCategory;
  label: string;
  accentVar: string;
  count: number;
}

export interface DistilleryStat {
  name: string;
  avgRating: number;
  count: number;
}

export interface FlavorTagStat {
  tag: string;
  count: number;
}

function ratedEntries(entries: LogEntry[]): LogEntry[] {
  return entries.filter((e) => typeof e.rating === 'number' && e.rating! > 0);
}

export function computeSummary(entries: LogEntry[]): SummaryStats {
  const distilleries = new Set<string>();
  let spent = 0;
  let ratingSum = 0;
  let ratingCount = 0;

  for (const e of entries) {
    if (e.distillery) {
      distilleries.add(e.distillery.trim().toLowerCase());
    }
    if (typeof e.purchasePrice === 'number') {
      spent += e.purchasePrice;
    }
    if (typeof e.rating === 'number' && e.rating > 0) {
      ratingSum += e.rating;
      ratingCount += 1;
    }
  }

  return {
    totalBourbons: entries.length,
    totalDistilleries: distilleries.size,
    totalSpent: spent,
    avgRating: ratingCount ? ratingSum / ratingCount : null,
  };
}

/** Count of entries per half-star rating value (0.5 … 5.0). */
export function ratingDistribution(entries: LogEntry[]): RatingBin[] {
  const bins: RatingBin[] = [];
  for (let v = 0.5; v <= 5.0001; v += 0.5) {
    const value = Math.round(v * 2) / 2;
    bins.push({ value, label: `${value}`, count: 0 });
  }
  for (const e of ratedEntries(entries)) {
    const value = Math.round(e.rating! * 2) / 2;
    const bin = bins.find((b) => b.value === value);
    if (bin) {
      bin.count += 1;
    }
  }
  return bins;
}

/** Entry counts per category, largest first, zero-count categories dropped. */
export function categoryBreakdown(entries: LogEntry[]): CategorySlice[] {
  const counts = new Map<BourbonCategory, number>();
  for (const e of entries) {
    counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([category, count]) => ({
      category,
      label: CATEGORY_DISPLAY[category]?.label ?? category,
      accentVar: CATEGORY_DISPLAY[category]?.accentVar ?? 'var(--color-cat-other)',
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

/** Top distilleries by average rating; requires >= minEntries rated entries. */
export function topDistilleries(
  entries: LogEntry[],
  limit = 3,
  minEntries = 2
): DistilleryStat[] {
  const groups = new Map<string, { sum: number; count: number; name: string }>();
  for (const e of ratedEntries(entries)) {
    if (!e.distillery) {
      continue;
    }
    const key = e.distillery.trim().toLowerCase();
    const g = groups.get(key) ?? { sum: 0, count: 0, name: e.distillery.trim() };
    g.sum += e.rating!;
    g.count += 1;
    groups.set(key, g);
  }
  return [...groups.values()]
    .filter((g) => g.count >= minEntries)
    .map((g) => ({ name: g.name, avgRating: g.sum / g.count, count: g.count }))
    .sort((a, b) => b.avgRating - a.avgRating || b.count - a.count)
    .slice(0, limit);
}

/** Most-used flavor tags across nose/palate/finish, most frequent first. */
export interface PreferenceBucket {
  label: string;
  /** Average rating in this bucket, or null when empty. */
  avg: number | null;
  count: number;
}

export interface PreferenceCurve {
  buckets: PreferenceBucket[];
  /** Total rated data points across all buckets. */
  totalPoints: number;
}

/** Minimum rated data points before a preference curve is worth showing. */
export const PREFERENCE_MIN_POINTS = 5;

/**
 * Builds an average-rating-per-bucket curve. `bucketOf` returns the index of
 * the bucket an entry falls into, or null to exclude it (e.g. missing proof).
 */
function buildCurve(
  entries: LogEntry[],
  labels: string[],
  bucketOf: (e: LogEntry) => number | null
): PreferenceCurve {
  const acc = labels.map(() => ({ sum: 0, count: 0 }));
  let totalPoints = 0;
  for (const e of ratedEntries(entries)) {
    const idx = bucketOf(e);
    if (idx == null || idx < 0 || idx >= acc.length) {
      continue;
    }
    acc[idx].sum += e.rating!;
    acc[idx].count += 1;
    totalPoints += 1;
  }
  return {
    buckets: labels.map((label, i) => ({
      label,
      avg: acc[i].count ? acc[i].sum / acc[i].count : null,
      count: acc[i].count,
    })),
    totalPoints,
  };
}

const PROOF_LABELS = ['≤90', '91–100', '101–110', '111–120', '>120'];

/** Average rating by proof range (entries need both proof and a rating). */
export function proofPreference(entries: LogEntry[]): PreferenceCurve {
  return buildCurve(entries, PROOF_LABELS, (e) => {
    if (typeof e.proof !== 'number') {
      return null;
    }
    const p = e.proof;
    if (p <= 90) return 0;
    if (p <= 100) return 1;
    if (p <= 110) return 2;
    if (p <= 120) return 3;
    return 4;
  });
}

const AGE_LABELS = ['NAS', '<6yr', '6–10yr', '11–15yr', '>15yr'];

/** Average rating by age range; NAS bottles form their own bucket. */
export function agePreference(entries: LogEntry[]): PreferenceCurve {
  return buildCurve(entries, AGE_LABELS, (e) => {
    if (e.isNas) {
      return 0;
    }
    if (typeof e.ageStatement !== 'number') {
      return null;
    }
    const a = e.ageStatement;
    if (a < 6) return 1;
    if (a <= 10) return 2;
    if (a <= 15) return 3;
    return 4;
  });
}

export interface MonthActivity {
  /** Sortable key, e.g. "2026-03". */
  key: string;
  label: string;
  count: number;
  entries: LogEntry[];
}

export type ActivityRange = '3m' | '12m' | 'all';

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}

/** Bottles logged per month over the requested window (oldest → newest). */
export function activityByMonth(
  entries: LogEntry[],
  range: ActivityRange
): MonthActivity[] {
  const now = new Date();
  let start: Date;
  if (range === 'all') {
    const earliest = entries.reduce<Date | null>((min, e) => {
      const d = e.entryDate?.toDate?.() ?? null;
      if (!d) return min;
      return !min || d < min ? d : min;
    }, null);
    start = earliest ?? now;
  } else {
    const months = range === '3m' ? 2 : 11; // inclusive of current month
    start = new Date(now.getFullYear(), now.getMonth() - months, 1);
  }

  const buckets: MonthActivity[] = [];
  const index = new Map<string, MonthActivity>();
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 1);
  while (cursor <= end) {
    const bucket: MonthActivity = {
      key: monthKey(cursor),
      label: monthLabel(cursor),
      count: 0,
      entries: [],
    };
    buckets.push(bucket);
    index.set(bucket.key, bucket);
    cursor.setMonth(cursor.getMonth() + 1);
  }

  for (const e of entries) {
    const d = e.entryDate?.toDate?.();
    if (!d) {
      continue;
    }
    const bucket = index.get(monthKey(d));
    if (bucket) {
      bucket.count += 1;
      bucket.entries.push(e);
    }
  }
  return buckets;
}

export interface FlavorAffinity {
  tag: string;
  avgRating: number;
  count: number;
}

/** Minimum bottles carrying a flavor note before it counts toward taste. */
export const TASTE_MIN_COUNT = 2;

/**
 * Taste preference: average rating of the bottles carrying each flavor note,
 * highest first. Surfaces which notes track with your best-rated pours. A note
 * is counted once per entry even if it appears in multiple tasting stages.
 */
export function tastePreference(
  entries: LogEntry[],
  minCount = TASTE_MIN_COUNT,
  limit = 6
): FlavorAffinity[] {
  const acc = new Map<string, { sum: number; count: number }>();
  for (const e of ratedEntries(entries)) {
    const tags = new Set([
      ...(e.noseTags ?? []),
      ...(e.palateTags ?? []),
      ...(e.finishTags ?? []),
    ]);
    for (const tag of tags) {
      const g = acc.get(tag) ?? { sum: 0, count: 0 };
      g.sum += e.rating!;
      g.count += 1;
      acc.set(tag, g);
    }
  }
  return [...acc.entries()]
    .filter(([, g]) => g.count >= minCount)
    .map(([tag, g]) => ({ tag, avgRating: g.sum / g.count, count: g.count }))
    .sort((a, b) => b.avgRating - a.avgRating || b.count - a.count)
    .slice(0, limit);
}

export function topFlavorTags(entries: LogEntry[], limit = 5): FlavorTagStat[] {
  const counts = new Map<string, number>();
  for (const e of entries) {
    for (const tag of [
      ...(e.noseTags ?? []),
      ...(e.palateTags ?? []),
      ...(e.finishTags ?? []),
    ]) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, limit);
}
