import { Timestamp } from '@angular/fire/firestore';
import { LogEntry } from '../../models';
import { groupEntriesByPeriod } from './entry-groups';

const at = (iso: string) =>
  ({ toMillis: () => new Date(iso).getTime() } as unknown as Timestamp);

function entry(over: Partial<LogEntry> = {}): LogEntry {
  return {
    id: Math.random().toString(36).slice(2),
    bourbonName: 'Weller 12',
    category: 'bourbon',
    entryType: 'bottle_purchased',
    entryDate: at('2026-03-15T12:00:00'),
    ...over,
  } as LogEntry;
}

// "Today" for every test — July 2026, so 2026 is the current year.
const NOW = new Date('2026-07-15T12:00:00');

const group = (entries: LogEntry[], view: 'journal' | 'graveyard' = 'journal') =>
  groupEntriesByPeriod(entries, view, NOW);

describe('groupEntriesByPeriod', () => {
  it('groups current-year entries by month, newest group first', () => {
    const july = entry({ entryDate: at('2026-07-02T10:00:00') });
    const march = entry({ entryDate: at('2026-03-15T10:00:00') });
    const groups = group([march, july]);

    expect(groups.map((g) => g.key)).toEqual(['2026-07', '2026-03']);
    expect(groups.map((g) => g.label)).toEqual(['July 2026', 'March 2026']);
    expect(groups[0].entries).toEqual([july]);
  });

  it('rolls prior years up into one group per year', () => {
    const groups = group([
      entry({ entryDate: at('2025-11-01T10:00:00') }),
      entry({ entryDate: at('2025-02-01T10:00:00') }),
      entry({ entryDate: at('2024-06-01T10:00:00') }),
    ]);

    expect(groups.map((g) => g.key)).toEqual(['2025', '2024']);
    expect(groups.map((g) => g.label)).toEqual(['2025', '2024']);
    expect(groups[0].entries).toHaveLength(2);
  });

  it('orders month groups ahead of older year groups', () => {
    const groups = group([
      entry({ entryDate: at('2024-06-01T10:00:00') }),
      entry({ entryDate: at('2026-01-05T10:00:00') }),
    ]);

    expect(groups.map((g) => g.key)).toEqual(['2026-01', '2024']);
  });

  it('sorts entries inside a group newest first', () => {
    const early = entry({ entryDate: at('2026-07-01T10:00:00') });
    const late = entry({ entryDate: at('2026-07-09T10:00:00') });
    const groups = group([early, late]);

    expect(groups[0].entries).toEqual([late, early]);
  });

  it('groups the Graveyard by kill date, not log date', () => {
    const e = entry({
      entryDate: at('2025-12-20T10:00:00'),
      finishedAt: at('2026-06-05T10:00:00'),
    });

    expect(group([e], 'graveyard')[0].key).toBe('2026-06');
    expect(group([e], 'journal')[0].key).toBe('2025');
  });

  it('falls back to the log date for finished bottles without a kill date', () => {
    const e = entry({ entryDate: at('2026-04-10T10:00:00'), finishedAt: null });

    expect(group([e], 'graveyard')[0].key).toBe('2026-04');
  });

  it('returns no groups for an empty list', () => {
    expect(group([])).toEqual([]);
  });
});
