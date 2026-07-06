import { haversineMiles, isWithinMiles } from './geo';

describe('haversineMiles', () => {
  it('is zero for the same point', () => {
    expect(haversineMiles({ lat: 38.25, lng: -85.75 }, { lat: 38.25, lng: -85.75 })).toBe(0);
  });

  it('matches a known long-distance pair (NYC → LA ≈ 2445 mi)', () => {
    const miles = haversineMiles(
      { lat: 40.7128, lng: -74.006 },
      { lat: 34.0522, lng: -118.2437 }
    );
    expect(miles).toBeGreaterThan(2400);
    expect(miles).toBeLessThan(2500);
  });

  it('matches a known short-distance pair (Louisville → Bardstown ≈ 33 mi)', () => {
    const miles = haversineMiles(
      { lat: 38.2527, lng: -85.7585 },
      { lat: 37.8093, lng: -85.4669 }
    );
    expect(miles).toBeGreaterThan(28);
    expect(miles).toBeLessThan(38);
  });
});

describe('isWithinMiles', () => {
  const center = { lat: 38.2527, lng: -85.7585 }; // Louisville
  const bardstown = { lat: 37.8093, lng: -85.4669 }; // ~33 mi

  it('includes points inside the radius', () => {
    expect(isWithinMiles(center, bardstown, 50)).toBe(true);
  });

  it('excludes points outside the radius', () => {
    expect(isWithinMiles(center, bardstown, 20)).toBe(false);
  });
});
