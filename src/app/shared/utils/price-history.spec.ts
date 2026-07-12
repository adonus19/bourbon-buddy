import { Timestamp } from '@angular/fire/firestore';

import { PriceHistoryPoint } from '../../models';
import {
  friendUidsForQuery,
  mergePricePoints,
  pointsWithinDays,
  priceStats,
} from './price-history';

const DAY = 24 * 60 * 60 * 1000;

function point(
  id: string,
  price: number,
  daysAgo: number,
  over: Partial<PriceHistoryPoint> = {}
): PriceHistoryPoint {
  return {
    id,
    bourbonId: 'b1',
    price,
    sightingDate: Timestamp.fromMillis(Date.now() - daysAgo * DAY),
    spotterUid: 'u1',
    visibility: 'private',
    createdAt: Timestamp.now(),
    ...over,
  };
}

describe('mergePricePoints', () => {
  it('dedupes by id across groups (own + friends overlap is defensive)', () => {
    const merged = mergePricePoints(
      [point('p1', 50, 10), point('p2', 60, 5)],
      [point('p1', 50, 10)]
    );
    expect(merged).toHaveLength(2);
    // p1 is 10d ago, p2 is 5d ago → oldest→newest is p1, p2
    expect(merged.map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('sorts oldest → newest by sightingDate', () => {
    const merged = mergePricePoints([
      point('newer', 70, 1),
      point('older', 40, 30),
      point('mid', 55, 15),
    ]);
    expect(merged.map((p) => p.id)).toEqual(['older', 'mid', 'newer']);
  });

  it('drops points without an id', () => {
    const noId = { ...point('x', 10, 1), id: undefined };
    const merged = mergePricePoints([noId], [point('y', 20, 2)]);
    expect(merged.map((p) => p.id)).toEqual(['y']);
  });

  it('returns [] for no groups or empty groups', () => {
    expect(mergePricePoints()).toEqual([]);
    expect(mergePricePoints([], [])).toEqual([]);
  });
});

describe('friendUidsForQuery', () => {
  it('drops blanks and the viewer themselves', () => {
    expect(friendUidsForQuery(['a', '', 'me', 'b'], 'me', 30)).toEqual(['a', 'b']);
  });

  it('caps at the provided limit', () => {
    const many = Array.from({ length: 40 }, (_, i) => `u${i}`);
    expect(friendUidsForQuery(many, 'x', 30)).toHaveLength(30);
  });

  it('returns [] when there are no other friends', () => {
    expect(friendUidsForQuery(['me'], 'me', 30)).toEqual([]);
  });
});

describe('priceStats', () => {
  it('returns null for no points', () => {
    expect(priceStats([])).toBeNull();
  });

  it('computes count/min/max and an odd-length median', () => {
    const s = priceStats([point('a', 50, 1), point('b', 30, 2), point('c', 70, 3)]);
    expect(s).toEqual({ count: 3, min: 30, max: 70, median: 50 });
  });

  it('averages the two middle values for an even-length median', () => {
    const s = priceStats([
      point('a', 40, 1),
      point('b', 60, 2),
      point('c', 30, 3),
      point('d', 50, 4),
    ]);
    // sorted prices 30,40,50,60 → median (40+50)/2 = 45
    expect(s).toEqual({ count: 4, min: 30, max: 60, median: 45 });
  });

  it('is order-independent (sorts prices internally)', () => {
    expect(priceStats([point('a', 100, 1), point('b', 10, 2)])).toMatchObject({
      min: 10,
      max: 100,
      median: 55,
    });
  });
});

describe('pointsWithinDays', () => {
  const now = 1000 * DAY; // fixed clock
  const pts: PriceHistoryPoint[] = [
    { ...point('old', 40, 0), sightingDate: Timestamp.fromMillis(now - 40 * DAY) },
    { ...point('edge', 50, 0), sightingDate: Timestamp.fromMillis(now - 30 * DAY) },
    { ...point('recent', 60, 0), sightingDate: Timestamp.fromMillis(now - 5 * DAY) },
  ];

  it('keeps points at or newer than the cutoff (inclusive edge)', () => {
    expect(pointsWithinDays(pts, 30, now).map((p) => p.id)).toEqual([
      'edge',
      'recent',
    ]);
  });

  it('keeps everything for a wide window', () => {
    expect(pointsWithinDays(pts, 90, now)).toHaveLength(3);
  });
});
