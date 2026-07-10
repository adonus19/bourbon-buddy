import { Timestamp } from '@angular/fire/firestore';
import { LogEntry } from '../../models';
import { bottleHistory } from './bottle-history';

const ts = (d: string) =>
  ({
    toDate: () => new Date(d),
    toMillis: () => new Date(d).getTime(),
  }) as unknown as Timestamp;

function entry(over: Partial<LogEntry> = {}): LogEntry {
  return {
    bourbonId: 'b1',
    bourbonName: 'Test',
    category: 'bourbon',
    isNas: false,
    entryType: 'bottle_purchased',
    didNotPurchase: false,
    noseTags: [],
    palateTags: [],
    finishTags: [],
    entryDate: ts('2026-01-01'),
    ...over,
  } as LogEntry;
}

describe('bottleHistory', () => {
  it('groups only matching bourbonId instances, newest first', () => {
    const h = bottleHistory(
      [
        entry({ id: 'a', bourbonId: 'b1', entryDate: ts('2026-01-01') }),
        entry({ id: 'b', bourbonId: 'b1', entryDate: ts('2026-03-01') }),
        entry({ id: 'c', bourbonId: 'other', entryDate: ts('2026-02-01') }),
      ],
      'b1'
    );
    expect(h.count).toBe(2);
    expect(h.instances.map((e) => e.id)).toEqual(['b', 'a']); // newest first
  });

  it('averages only rated instances', () => {
    const h = bottleHistory(
      [
        entry({ rating: 4 }),
        entry({ rating: 5 }),
        entry({ rating: null }),
      ],
      'b1'
    );
    expect(h.avgRating).toBe(4.5);
  });

  it('has null avg when nothing is rated', () => {
    expect(bottleHistory([entry({ rating: null })], 'b1').avgRating).toBeNull();
  });

  it('counts open vs finished via derived status', () => {
    const h = bottleHistory(
      [
        entry({ bottleStatus: 'open' }),
        entry({ bottleStatus: 'finished' }),
        entry({ bottleStatus: 'finished' }),
        entry({ entryType: 'drink' }), // non-owned → neither
      ],
      'b1'
    );
    expect(h.openCount).toBe(1);
    expect(h.finishedCount).toBe(2);
  });

  it('reports first and last logged dates', () => {
    const h = bottleHistory(
      [
        entry({ entryDate: ts('2026-01-01') }),
        entry({ entryDate: ts('2026-06-01') }),
        entry({ entryDate: ts('2026-03-01') }),
      ],
      'b1'
    );
    expect(h.firstLoggedAt?.toMillis()).toBe(ts('2026-01-01').toMillis());
    expect(h.lastLoggedAt?.toMillis()).toBe(ts('2026-06-01').toMillis());
  });

  it('builds a price trend from purchased instances, oldest first', () => {
    const h = bottleHistory(
      [
        entry({ purchaseDate: ts('2026-06-01'), purchasePrice: 60 }),
        entry({ purchaseDate: ts('2026-01-01'), purchasePrice: 35 }),
        entry({ didNotPurchase: true, purchasePrice: 99 }), // excluded
        entry({ purchasePrice: null }), // excluded
      ],
      'b1'
    );
    expect(h.priceTrend.map((p) => p.price)).toEqual([35, 60]);
  });

  it('falls back to entryDate for price-point ordering when no purchaseDate', () => {
    const h = bottleHistory(
      [
        entry({ entryDate: ts('2026-05-01'), purchasePrice: 50 }),
        entry({ entryDate: ts('2026-02-01'), purchasePrice: 40 }),
      ],
      'b1'
    );
    expect(h.priceTrend.map((p) => p.price)).toEqual([40, 50]);
  });

  it('returns an empty history for an unknown bottle', () => {
    const h = bottleHistory([entry()], 'nope');
    expect(h.count).toBe(0);
    expect(h.firstLoggedAt).toBeNull();
    expect(h.priceTrend).toEqual([]);
  });
});
