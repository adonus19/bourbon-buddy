import { LogEntry } from '../../models';
import { CellarView } from '../../shared/utils/bottle-lifecycle';

/**
 * Time-period sections for the Journal / Graveyard lists (collapsible in the
 * UI). Current-year entries group per month ("July 2026"); older years roll up
 * into one group per year ("2025") so a long history stays a short list of
 * sections. Pure presentation — computed from the already-loaded entries
 * signal, nothing stored.
 */
export interface EntryGroup {
  /** Stable id — 'YYYY-MM' for month groups, 'YYYY' for year groups. */
  key: string;
  /** Header text — 'July 2026' or '2025'. */
  label: string;
  /** Group members, newest first by the grouping date. */
  entries: LogEntry[];
}

/**
 * The date an entry is grouped/sorted by: the kill date in the Graveyard
 * (falling back to entryDate for legacy finished bottles without one), the
 * log date everywhere else.
 */
function groupMillis(e: LogEntry, view: CellarView): number {
  const ts = view === 'graveyard' ? e.finishedAt ?? e.entryDate : e.entryDate;
  return ts.toMillis();
}

export function groupEntriesByPeriod(
  entries: LogEntry[],
  view: CellarView,
  now: Date = new Date()
): EntryGroup[] {
  interface Bucket {
    key: string;
    label: string;
    sortMillis: number;
    entries: { e: LogEntry; ms: number }[];
  }
  const buckets = new Map<string, Bucket>();

  for (const e of entries) {
    const ms = groupMillis(e, view);
    const d = new Date(ms);
    const byMonth = d.getFullYear() === now.getFullYear();
    const key = byMonth
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      : String(d.getFullYear());

    let b = buckets.get(key);
    if (!b) {
      const label = byMonth
        ? d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        : String(d.getFullYear());
      b = { key, label, sortMillis: ms, entries: [] };
      buckets.set(key, b);
    }
    b.sortMillis = Math.max(b.sortMillis, ms);
    b.entries.push({ e, ms });
  }

  return [...buckets.values()]
    .sort((a, b) => b.sortMillis - a.sortMillis)
    .map((b) => ({
      key: b.key,
      label: b.label,
      entries: b.entries.sort((x, y) => y.ms - x.ms).map((x) => x.e),
    }));
}
