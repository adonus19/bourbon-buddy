import { Timestamp } from '@angular/fire/firestore';
import { EntryType, LogEntry } from '../../models';
import {
  deriveBottleStatus,
  isFinishedBottle,
  isOnShelf,
  isOwnedBottle,
  matchesCellarView,
  timeToKillDays,
} from './bottle-lifecycle';

const ts = (d: Date) =>
  ({ toDate: () => d, toMillis: () => d.getTime() }) as unknown as Timestamp;

function entry(over: Partial<LogEntry> = {}): LogEntry {
  return {
    bourbonId: 'b1',
    bourbonName: 'Test Bottle',
    category: 'bourbon',
    isNas: false,
    entryType: 'bottle_purchased',
    didNotPurchase: false,
    noseTags: [],
    palateTags: [],
    finishTags: [],
    entryDate: ts(new Date('2026-01-01T12:00:00')),
    ...over,
  } as LogEntry;
}

describe('isOwnedBottle', () => {
  it('is true for purchased and gifted bottles', () => {
    expect(isOwnedBottle(entry({ entryType: 'bottle_purchased' }))).toBe(true);
    expect(isOwnedBottle(entry({ entryType: 'gift_received' }))).toBe(true);
  });

  it('is false for non-owned experiences', () => {
    const nonOwned: EntryType[] = ['drink', 'sample_split', 'virtual_tasting'];
    for (const t of nonOwned) {
      expect(isOwnedBottle(entry({ entryType: t }))).toBe(false);
    }
  });
});

describe('deriveBottleStatus', () => {
  it('returns null for non-owned entries regardless of remaining/status', () => {
    expect(
      deriveBottleStatus(
        entry({ entryType: 'drink', bottleStatus: 'open', bottleRemainingPct: 50 })
      )
    ).toBeNull();
  });

  it('uses the explicit status when present', () => {
    expect(deriveBottleStatus(entry({ bottleStatus: 'finished' }))).toBe(
      'finished'
    );
    expect(deriveBottleStatus(entry({ bottleStatus: 'open' }))).toBe('open');
  });

  it('falls back to remaining % for legacy entries with no status', () => {
    expect(deriveBottleStatus(entry({ bottleRemainingPct: 0 }))).toBe(
      'finished'
    );
    expect(deriveBottleStatus(entry({ bottleRemainingPct: 25 }))).toBe('open');
  });

  it('treats an owned bottle with no remaining data as open', () => {
    expect(deriveBottleStatus(entry({ bottleRemainingPct: null }))).toBe('open');
    expect(deriveBottleStatus(entry({}))).toBe('open');
  });

  it('prefers an explicit status over a stale remaining %', () => {
    // Killed but remaining still reads full → explicit status wins.
    expect(
      deriveBottleStatus(
        entry({ bottleStatus: 'finished', bottleRemainingPct: 100 })
      )
    ).toBe('finished');
  });
});

describe('shelf / graveyard predicates', () => {
  it('classifies open owned bottles as on-shelf only', () => {
    const e = entry({ bottleStatus: 'open' });
    expect(isOnShelf(e)).toBe(true);
    expect(isFinishedBottle(e)).toBe(false);
  });

  it('classifies finished owned bottles as graveyard only', () => {
    const e = entry({ bottleStatus: 'finished' });
    expect(isOnShelf(e)).toBe(false);
    expect(isFinishedBottle(e)).toBe(true);
  });

  it('never puts non-owned entries on shelf or graveyard', () => {
    const e = entry({ entryType: 'drink' });
    expect(isOnShelf(e)).toBe(false);
    expect(isFinishedBottle(e)).toBe(false);
  });
});

describe('matchesCellarView', () => {
  const open = entry({ bottleStatus: 'open' });
  const killed = entry({ bottleStatus: 'finished' });
  const drink = entry({ entryType: 'drink' });

  it('Shelf holds only open owned bottles', () => {
    expect(matchesCellarView(open, 'shelf')).toBe(true);
    expect(matchesCellarView(killed, 'shelf')).toBe(false);
    expect(matchesCellarView(drink, 'shelf')).toBe(false);
  });

  it('Graveyard holds only finished owned bottles', () => {
    expect(matchesCellarView(killed, 'graveyard')).toBe(true);
    expect(matchesCellarView(open, 'graveyard')).toBe(false);
    expect(matchesCellarView(drink, 'graveyard')).toBe(false);
  });

  it('Journal holds everything', () => {
    expect(matchesCellarView(open, 'journal')).toBe(true);
    expect(matchesCellarView(killed, 'journal')).toBe(true);
    expect(matchesCellarView(drink, 'journal')).toBe(true);
  });
});

describe('timeToKillDays', () => {
  it('returns whole days between purchase and kill for a finished bottle', () => {
    const e = entry({
      bottleStatus: 'finished',
      purchaseDate: ts(new Date('2026-01-01T00:00:00')),
      finishedAt: ts(new Date('2026-01-13T00:00:00')),
    });
    expect(timeToKillDays(e)).toBe(12);
  });

  it('is null when the bottle is not finished', () => {
    const e = entry({
      bottleStatus: 'open',
      purchaseDate: ts(new Date('2026-01-01')),
      finishedAt: ts(new Date('2026-01-13')),
    });
    expect(timeToKillDays(e)).toBeNull();
  });

  it('is null when a required date is missing', () => {
    expect(
      timeToKillDays(entry({ bottleStatus: 'finished', purchaseDate: null }))
    ).toBeNull();
    expect(
      timeToKillDays(
        entry({
          bottleStatus: 'finished',
          purchaseDate: ts(new Date('2026-01-01')),
          finishedAt: null,
        })
      )
    ).toBeNull();
  });

  it('is null when finished predates purchase (bad data)', () => {
    const e = entry({
      bottleStatus: 'finished',
      purchaseDate: ts(new Date('2026-02-01')),
      finishedAt: ts(new Date('2026-01-01')),
    });
    expect(timeToKillDays(e)).toBeNull();
  });
});
