import { WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Timestamp } from '@angular/fire/firestore';

import { LogEntry } from '../../models';
import { LogEntryService } from './log-entry.service';
import { StatsService } from './stats.service';

const ts = (d: Date) => ({ toDate: () => d } as unknown as Timestamp);

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
    noseTags: ['caramel'],
    palateTags: [],
    finishTags: [],
    ...over,
  } as LogEntry;
}

describe('StatsService', () => {
  let entries: WritableSignal<LogEntry[]>;
  let stats: StatsService;

  beforeEach(() => {
    entries = signal<LogEntry[]>([]);
    TestBed.configureTestingModule({
      providers: [
        StatsService,
        { provide: LogEntryService, useValue: { entries } },
      ],
    });
    stats = TestBed.inject(StatsService);
  });

  it('hasData reacts to the log signal', () => {
    expect(stats.hasData()).toBe(false);
    entries.set([entry()]);
    expect(stats.hasData()).toBe(true);
  });

  it('passes entries through and derives summary/breakdowns', () => {
    entries.set([
      entry({ category: 'bourbon', rating: 4, distillery: 'A' }),
      entry({ category: 'rye', rating: 5, distillery: 'B' }),
    ]);
    expect(stats.entries()).toHaveLength(2);
    expect(stats.summary().totalBourbons).toBe(2);
    expect(stats.summary().avgRating).toBeCloseTo(4.5);
    expect(stats.categoryBreakdown()).toHaveLength(2);
    expect(stats.ratingDistribution()).toHaveLength(10);
  });

  it('exposes the preference curves and tag rollups', () => {
    entries.set([entry(), entry({ noseTags: ['oak'], palateTags: ['oak'] })]);
    expect(stats.proofPreference().buckets).toHaveLength(5);
    expect(stats.agePreference().buckets).toHaveLength(5);
    expect(Array.isArray(stats.tastePreference())).toBe(true);
    expect(Array.isArray(stats.topDistilleries())).toBe(true);
    expect(Array.isArray(stats.topFlavorTags())).toBe(true);
  });
});
