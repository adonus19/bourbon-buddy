import { Timestamp } from '@angular/fire/firestore';
import { LogEntry } from '../../models';
import {
  EMPTY_LOG_FILTER,
  LogFilter,
  activeChips,
  isFilterActive,
  matchesFilter,
  matchesSearch,
} from './log-filter';

const at = (iso: string) =>
  ({ toMillis: () => new Date(iso).getTime() } as unknown as Timestamp);

function entry(over: Partial<LogEntry> = {}): LogEntry {
  return {
    bourbonName: 'Weller 12',
    distillery: 'Buffalo Trace',
    category: 'bourbon',
    entryType: 'bottle_purchased',
    rating: 4,
    proof: 90,
    entryDate: at('2026-03-15T12:00:00'),
    noseTags: ['caramel'],
    palateTags: ['oak'],
    finishTags: ['spice'],
    ...over,
  } as LogEntry;
}

const filter = (over: Partial<LogFilter>): LogFilter => ({
  ...EMPTY_LOG_FILTER,
  ...over,
});

describe('isFilterActive', () => {
  it('is false for the empty filter', () => {
    expect(isFilterActive(EMPTY_LOG_FILTER)).toBe(false);
  });

  it('is true when any criterion is set', () => {
    expect(isFilterActive(filter({ categories: ['rye'] }))).toBe(true);
    expect(isFilterActive(filter({ ratingMin: 3 }))).toBe(true);
    expect(isFilterActive(filter({ flavorTags: ['smoke'] }))).toBe(true);
    expect(isFilterActive(filter({ dateTo: '2026-01-01' }))).toBe(true);
  });
});

describe('matchesSearch', () => {
  it('matches name or distillery, case-insensitively', () => {
    expect(matchesSearch(entry(), 'weller')).toBe(true);
    expect(matchesSearch(entry(), 'BUFFALO')).toBe(true);
  });

  it('empty term matches everything', () => {
    expect(matchesSearch(entry(), '   ')).toBe(true);
  });

  it('returns false when neither field matches', () => {
    expect(matchesSearch(entry(), 'macallan')).toBe(false);
  });
});

describe('matchesFilter', () => {
  it('passes the empty filter', () => {
    expect(matchesFilter(entry(), EMPTY_LOG_FILTER)).toBe(true);
  });

  it('filters by category and entry type', () => {
    expect(matchesFilter(entry(), filter({ categories: ['rye'] }))).toBe(false);
    expect(matchesFilter(entry(), filter({ categories: ['bourbon'] }))).toBe(
      true
    );
    expect(
      matchesFilter(entry(), filter({ entryTypes: ['sample_split'] }))
    ).toBe(false);
  });

  it('applies rating and proof bounds (missing values excluded)', () => {
    expect(matchesFilter(entry({ rating: 2 }), filter({ ratingMin: 3 }))).toBe(
      false
    );
    expect(matchesFilter(entry({ rating: null }), filter({ ratingMin: 3 }))).toBe(
      false
    );
    expect(matchesFilter(entry({ rating: 5 }), filter({ ratingMax: 4 }))).toBe(
      false
    );
    expect(matchesFilter(entry({ proof: 80 }), filter({ proofMin: 90 }))).toBe(
      false
    );
    expect(matchesFilter(entry({ proof: 130 }), filter({ proofMax: 120 }))).toBe(
      false
    );
    expect(matchesFilter(entry({ proof: 100 }), filter({ proofMax: 120 }))).toBe(
      true
    );
  });

  it('applies the date range inclusively', () => {
    const e = entry({ entryDate: at('2026-03-15T12:00:00') });
    expect(matchesFilter(e, filter({ dateFrom: '2026-03-16' }))).toBe(false);
    expect(matchesFilter(e, filter({ dateTo: '2026-03-14' }))).toBe(false);
    expect(
      matchesFilter(e, filter({ dateFrom: '2026-03-15', dateTo: '2026-03-15' }))
    ).toBe(true);
  });

  it('matches when the entry has ANY of the flavor tags', () => {
    expect(matchesFilter(entry(), filter({ flavorTags: ['oak'] }))).toBe(true);
    expect(matchesFilter(entry(), filter({ flavorTags: ['smoke'] }))).toBe(
      false
    );
  });
});

describe('activeChips', () => {
  it('produces a dismissible chip per active criterion', () => {
    const f = filter({
      categories: ['bourbon'],
      entryTypes: ['bottle_purchased'],
      ratingMin: 3,
      proofMax: 120,
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
      flavorTags: ['oak'],
    });
    const chips = activeChips(f);
    // category + entryType + rating + proof + from + to + one tag = 7
    expect(chips).toHaveLength(7);
  });

  it("each chip's `next` removes only that criterion", () => {
    const f = filter({ categories: ['bourbon'], flavorTags: ['oak', 'smoke'] });
    const chips = activeChips(f);
    const categoryChip = chips.find((c) => c.next.categories.length === 0)!;
    expect(categoryChip.next.flavorTags).toEqual(['oak', 'smoke']);
  });

  it('returns no chips for the empty filter', () => {
    expect(activeChips(EMPTY_LOG_FILTER)).toEqual([]);
  });
});
