import { Timestamp } from '@angular/fire/firestore';
import { Sighting } from '../../models';
import {
  SIGHTING_STALE_DAYS,
  bestNonStalePrice,
  isSightingStale,
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
