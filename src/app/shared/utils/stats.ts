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
