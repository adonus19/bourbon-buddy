import { Timestamp } from '@angular/fire/firestore';
import { Sighting } from '../../models';
import {
  DISPUTE_STALE_THRESHOLD,
  SIGHTING_AGING_DAYS,
  SIGHTING_STALE_DAYS,
  bestNonStalePrice,
  isCommunityStale,
  isSightingStale,
  sightingFreshness,
} from './sighting';

const DAY = 24 * 60 * 60 * 1000;
// Dates are relative to real "now" because bestNonStalePrice reads Date.now()
// internally (it takes no clock argument).
const NOW = Date.now();

/** Minimal Sighting stub with just the fields these helpers read. */
function sighting(daysAgo: number, price: number, stale = false): Sighting {
  return {
    price,
    markedStaleManually: stale,
    sightingDate: {
      toMillis: () => NOW - daysAgo * DAY,
    } as unknown as Timestamp,
  } as Sighting;
}

describe('isSightingStale', () => {
  it('is stale when manually flagged, regardless of date', () => {
    expect(isSightingStale(sighting(0, 40, true), NOW)).toBe(true);
  });

  it('is stale when older than the staleness window', () => {
    expect(isSightingStale(sighting(SIGHTING_STALE_DAYS + 1, 40), NOW)).toBe(
      true
    );
  });

  it('is fresh when recent and not flagged', () => {
    expect(isSightingStale(sighting(1, 40), NOW)).toBe(false);
    expect(isSightingStale(sighting(SIGHTING_STALE_DAYS - 1, 40), NOW)).toBe(
      false
    );
  });
});

describe('sightingFreshness', () => {
  it('is fresh at or under the aging threshold', () => {
    expect(sightingFreshness(sighting(0, 40), NOW)).toBe('fresh');
    expect(sightingFreshness(sighting(SIGHTING_AGING_DAYS, 40), NOW)).toBe(
      'fresh'
    );
  });

  it('is aging just past the aging threshold and up to the stale threshold', () => {
    expect(sightingFreshness(sighting(SIGHTING_AGING_DAYS + 1, 40), NOW)).toBe(
      'aging'
    );
    expect(sightingFreshness(sighting(SIGHTING_STALE_DAYS, 40), NOW)).toBe(
      'aging'
    );
  });

  it('is stale past the stale threshold', () => {
    expect(sightingFreshness(sighting(SIGHTING_STALE_DAYS + 1, 40), NOW)).toBe(
      'stale'
    );
  });

  it('is stale when manually flagged regardless of date', () => {
    expect(sightingFreshness(sighting(0, 40, true), NOW)).toBe('stale');
  });
});

describe('community trust signals (BB-194)', () => {
  const ts = (daysAgo: number) =>
    ({ toMillis: () => NOW - daysAgo * DAY }) as unknown as Timestamp;

  it('a fresh in-person confirmation restarts the freshness clock', () => {
    const s = {
      ...sighting(SIGHTING_STALE_DAYS - 1, 40),
      confirmCount: 1,
      lastConfirmedAt: ts(1),
    };
    expect(sightingFreshness(s, NOW)).toBe('fresh');
  });

  it('an old confirmation does not outlive the window', () => {
    const s = {
      ...sighting(SIGHTING_STALE_DAYS + 10, 40),
      confirmCount: 1,
      lastConfirmedAt: ts(SIGHTING_STALE_DAYS + 5),
    };
    expect(sightingFreshness(s, NOW)).toBe('stale');
  });

  it('enough "gone" votes force stale even on a recent sighting', () => {
    const s = { ...sighting(1, 40), disputeCount: DISPUTE_STALE_THRESHOLD };
    expect(sightingFreshness(s, NOW)).toBe('stale');
    expect(isCommunityStale(s)).toBe(true);
  });

  it('disputes must outnumber confirms to bury a sighting', () => {
    const s = {
      ...sighting(1, 40),
      disputeCount: DISPUTE_STALE_THRESHOLD,
      confirmCount: DISPUTE_STALE_THRESHOLD,
      lastConfirmedAt: ts(0),
    };
    expect(isCommunityStale(s)).toBe(false);
    expect(sightingFreshness(s, NOW)).toBe('fresh');
  });

  it('a lone dispute never buries a sighting', () => {
    const s = { ...sighting(1, 40), disputeCount: 1 };
    expect(sightingFreshness(s, NOW)).toBe('fresh');
  });
});

describe('bestNonStalePrice', () => {
  it('returns the lowest non-stale price', () => {
    const list = [sighting(1, 60), sighting(1, 45), sighting(1, 80)];
    expect(bestNonStalePrice(list)).toBe(45);
  });

  it('ignores stale sightings even if cheaper', () => {
    const list = [sighting(1, 60), sighting(1, 30, true), sighting(400, 20)];
    expect(bestNonStalePrice(list)).toBe(60);
  });

  it('returns null when there are no fresh sightings', () => {
    expect(bestNonStalePrice([])).toBeNull();
    expect(bestNonStalePrice([sighting(1, 50, true)])).toBeNull();
  });
});
