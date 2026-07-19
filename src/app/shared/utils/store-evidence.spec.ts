import { Timestamp } from '@angular/fire/firestore';

import { PriceHistoryPoint } from '../../models';
import {
  bottlesToResolve,
  liveStorePoints,
  pctVsMsrp,
  recentStores,
  storeEvidence,
} from './store-evidence';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-07-18T12:00:00Z').getTime();

const point = (over: Partial<PriceHistoryPoint> = {}): PriceHistoryPoint =>
  ({
    id: Math.random().toString(36).slice(2),
    bourbonId: 'b1',
    price: 100,
    sightingDate: Timestamp.fromMillis(NOW),
    storeName: 'Total Wine',
    city: 'Louisville',
    state: 'KY',
    spotterUid: 'me',
    visibility: 'private',
    createdAt: Timestamp.fromMillis(NOW),
    ...over,
  }) as PriceHistoryPoint;

describe('pctVsMsrp (BB-224)', () => {
  it('reports a premium as positive and a discount as negative', () => {
    expect(pctVsMsrp(110, 100)).toBe(10);
    expect(pctVsMsrp(90, 100)).toBe(-10);
  });

  it('returns null when MSRP is missing or unusable', () => {
    expect(pctVsMsrp(100, null)).toBeNull();
    expect(pctVsMsrp(100, undefined)).toBeNull();
    expect(pctVsMsrp(100, 0)).toBeNull();
    expect(pctVsMsrp(100, -5)).toBeNull();
  });
});

describe('storeEvidence (BB-224)', () => {
  it('returns an empty read for no points', () => {
    const e = storeEvidence([]);
    expect(e.sightingCount).toBe(0);
    expect(e.visitCount).toBe(0);
    expect(e.lastSeen).toBeNull();
    expect(e.bottlesSpotted).toBe(0);
    expect(e.avgPctVsMsrp).toBeNull();
    expect(e.msrpSampleSize).toBe(0);
  });

  it('counts two sightings on one day as a single visit', () => {
    const e = storeEvidence([
      point({ sightingDate: Timestamp.fromMillis(NOW) }),
      point({ sightingDate: Timestamp.fromMillis(NOW + 60_000), bourbonId: 'b2' }),
    ]);
    expect(e.sightingCount).toBe(2);
    expect(e.visitCount).toBe(1);
    expect(e.bottlesSpotted).toBe(2);
  });

  it('counts distinct bottles, not repeat sightings of one bottle', () => {
    const e = storeEvidence([
      point({ bourbonId: 'b1' }),
      point({ bourbonId: 'b1', sightingDate: Timestamp.fromMillis(NOW - 5 * DAY_MS) }),
    ]);
    expect(e.bottlesSpotted).toBe(1);
    expect(e.visitCount).toBe(2);
  });

  it('reports the newest sighting as lastSeen', () => {
    const e = storeEvidence([
      point({ sightingDate: Timestamp.fromMillis(NOW - 10 * DAY_MS) }),
      point({ sightingDate: Timestamp.fromMillis(NOW - 2 * DAY_MS) }),
    ]);
    expect(e.lastSeen?.getTime()).toBe(NOW - 2 * DAY_MS);
  });

  it('averages percent vs MSRP only over bottles with a known MSRP', () => {
    const e = storeEvidence(
      [
        point({ bourbonId: 'b1', price: 110 }), // +10%
        point({ bourbonId: 'b2', price: 90 }), //  -10%
        point({ bourbonId: 'b3', price: 500 }), // no msrp — sits out
      ],
      { b1: 100, b2: 100 }
    );
    expect(e.avgPctVsMsrp).toBe(0);
    expect(e.msrpSampleSize).toBe(2);
  });

  it('leaves the MSRP average null when no bottle has an MSRP', () => {
    const e = storeEvidence([point({ price: 120 })], {});
    expect(e.avgPctVsMsrp).toBeNull();
    expect(e.msrpSampleSize).toBe(0);
  });
});

describe('bottlesToResolve (BB-224)', () => {
  it('returns distinct ids newest-first, capped', () => {
    const ids = bottlesToResolve(
      [
        point({ bourbonId: 'old', sightingDate: Timestamp.fromMillis(NOW - 9 * DAY_MS) }),
        point({ bourbonId: 'new', sightingDate: Timestamp.fromMillis(NOW) }),
        point({ bourbonId: 'new', sightingDate: Timestamp.fromMillis(NOW - DAY_MS) }),
        point({ bourbonId: 'mid', sightingDate: Timestamp.fromMillis(NOW - 3 * DAY_MS) }),
      ],
      2
    );
    expect(ids).toEqual(['new', 'mid']);
  });

  it('is empty for no points', () => {
    expect(bottlesToResolve([], 10)).toEqual([]);
  });
});

describe('liveStorePoints (BB-224)', () => {
  it('keeps points inside the 30-day window, newest first', () => {
    const live = liveStorePoints(
      [
        point({ bourbonId: 'stale', sightingDate: Timestamp.fromMillis(NOW - 31 * DAY_MS) }),
        point({ bourbonId: 'older', sightingDate: Timestamp.fromMillis(NOW - 20 * DAY_MS) }),
        point({ bourbonId: 'fresh', sightingDate: Timestamp.fromMillis(NOW - DAY_MS) }),
      ],
      NOW
    );
    expect(live.map((p) => p.bourbonId)).toEqual(['fresh', 'older']);
  });

  it('treats the cutoff itself as still live', () => {
    const live = liveStorePoints(
      [point({ sightingDate: Timestamp.fromMillis(NOW - 30 * DAY_MS) })],
      NOW
    );
    expect(live.length).toBe(1);
  });
});

describe('recentStores (BB-225)', () => {
  it('dedupes per location, newest-first, capped', () => {
    const recent = recentStores(
      [
        point({
          storeName: 'Liquor Barn',
          city: 'Lexington',
          sightingDate: Timestamp.fromMillis(NOW - 5 * DAY_MS),
        }),
        point({
          storeName: 'Total Wine',
          city: 'Louisville',
          sightingDate: Timestamp.fromMillis(NOW),
        }),
        point({
          storeName: 'total wine',
          city: 'louisville',
          sightingDate: Timestamp.fromMillis(NOW - DAY_MS),
        }),
      ],
      5
    );
    expect(recent.map((s) => s.name)).toEqual(['Total Wine', 'Liquor Barn']);
  });

  it('treats the same chain in two cities as two stores', () => {
    const recent = recentStores(
      [
        point({ storeName: 'Total Wine', city: 'Louisville' }),
        point({
          storeName: 'Total Wine',
          city: 'Lexington',
          sightingDate: Timestamp.fromMillis(NOW - DAY_MS),
        }),
      ],
      5
    );
    expect(recent.length).toBe(2);
  });

  it('skips points with no store name', () => {
    expect(recentStores([point({ storeName: '  ' })], 5)).toEqual([]);
  });

  it('honours the cap', () => {
    const pts = ['a', 'b', 'c'].map((n, i) =>
      point({ storeName: n, sightingDate: Timestamp.fromMillis(NOW - i * DAY_MS) })
    );
    expect(recentStores(pts, 2).map((s) => s.name)).toEqual(['a', 'b']);
  });
});
