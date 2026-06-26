import { BourbonCategory, EntryType, LogEntry } from '../../models';
import {
  CATEGORY_DISPLAY,
  ENTRY_TYPE_LABELS,
} from '../../shared/constants/category-display';

/** Active log-list filter. All criteria combine with AND. */
export interface LogFilter {
  categories: BourbonCategory[];
  entryTypes: EntryType[];
  ratingMin: number | null;
  ratingMax: number | null;
  proofMin: number | null;
  proofMax: number | null;
  dateFrom: string | null; // YYYY-MM-DD
  dateTo: string | null; // YYYY-MM-DD
  flavorTags: string[]; // entry matches if it has ANY of these
}

export const EMPTY_LOG_FILTER: LogFilter = {
  categories: [],
  entryTypes: [],
  ratingMin: null,
  ratingMax: null,
  proofMin: null,
  proofMax: null,
  dateFrom: null,
  dateTo: null,
  flavorTags: [],
};

export const RATING_BOUNDS = { min: 0, max: 5 };
export const PROOF_BOUNDS = { min: 80, max: 160 };

export function isFilterActive(f: LogFilter): boolean {
  return (
    f.categories.length > 0 ||
    f.entryTypes.length > 0 ||
    f.ratingMin != null ||
    f.ratingMax != null ||
    f.proofMin != null ||
    f.proofMax != null ||
    f.dateFrom != null ||
    f.dateTo != null ||
    f.flavorTags.length > 0
  );
}

export function matchesSearch(e: LogEntry, term: string): boolean {
  const t = term.trim().toLowerCase();
  if (!t) {
    return true;
  }
  return (
    e.bourbonName.toLowerCase().includes(t) ||
    (e.distillery ?? '').toLowerCase().includes(t)
  );
}

export function matchesFilter(e: LogEntry, f: LogFilter): boolean {
  if (f.categories.length && !f.categories.includes(e.category)) {
    return false;
  }
  if (f.entryTypes.length && !f.entryTypes.includes(e.entryType)) {
    return false;
  }
  if (f.ratingMin != null && (e.rating == null || e.rating < f.ratingMin)) {
    return false;
  }
  if (f.ratingMax != null && (e.rating == null || e.rating > f.ratingMax)) {
    return false;
  }
  if (f.proofMin != null && (e.proof == null || e.proof < f.proofMin)) {
    return false;
  }
  if (f.proofMax != null && (e.proof == null || e.proof > f.proofMax)) {
    return false;
  }
  const entryMs = e.entryDate.toMillis();
  if (f.dateFrom && entryMs < new Date(`${f.dateFrom}T00:00:00`).getTime()) {
    return false;
  }
  if (f.dateTo && entryMs > new Date(`${f.dateTo}T23:59:59`).getTime()) {
    return false;
  }
  if (f.flavorTags.length) {
    const tags = [...e.noseTags, ...e.palateTags, ...e.finishTags];
    if (!f.flavorTags.some((t) => tags.includes(t))) {
      return false;
    }
  }
  return true;
}

/** Dismissible chip descriptors; `next` is the filter with that chip removed. */
export function activeChips(f: LogFilter): { label: string; next: LogFilter }[] {
  const chips: { label: string; next: LogFilter }[] = [];

  for (const c of f.categories) {
    chips.push({
      label: CATEGORY_DISPLAY[c]?.label ?? c,
      next: { ...f, categories: f.categories.filter((x) => x !== c) },
    });
  }
  for (const t of f.entryTypes) {
    chips.push({
      label: ENTRY_TYPE_LABELS[t] ?? t,
      next: { ...f, entryTypes: f.entryTypes.filter((x) => x !== t) },
    });
  }
  if (f.ratingMin != null || f.ratingMax != null) {
    chips.push({
      label: `Rating ${f.ratingMin ?? RATING_BOUNDS.min}–${f.ratingMax ?? RATING_BOUNDS.max}★`,
      next: { ...f, ratingMin: null, ratingMax: null },
    });
  }
  if (f.proofMin != null || f.proofMax != null) {
    chips.push({
      label: `Proof ${f.proofMin ?? PROOF_BOUNDS.min}–${f.proofMax ?? PROOF_BOUNDS.max}`,
      next: { ...f, proofMin: null, proofMax: null },
    });
  }
  if (f.dateFrom) {
    chips.push({ label: `From ${f.dateFrom}`, next: { ...f, dateFrom: null } });
  }
  if (f.dateTo) {
    chips.push({ label: `To ${f.dateTo}`, next: { ...f, dateTo: null } });
  }
  for (const tag of f.flavorTags) {
    chips.push({
      label: tag,
      next: { ...f, flavorTags: f.flavorTags.filter((x) => x !== tag) },
    });
  }
  return chips;
}
