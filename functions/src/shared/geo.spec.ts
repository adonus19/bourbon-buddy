import { haversineMiles, withinAlertRadius } from "./geo";

describe("haversineMiles", () => {
  it("is zero for the same point", () => {
    expect(haversineMiles({ lat: 38.25, lng: -85.75 }, { lat: 38.25, lng: -85.75 })).toBe(0);
  });

  it("matches a known pair (NYC → LA ≈ 2445 mi)", () => {
    const mi = haversineMiles(
      { lat: 40.7128, lng: -74.006 },
      { lat: 34.0522, lng: -118.2437 }
    );
    expect(mi).toBeGreaterThan(2400);
    expect(mi).toBeLessThan(2500);
  });
});

describe("withinAlertRadius (BB-180)", () => {
  const louisville = { baseLat: 38.2527, baseLng: -85.7585, alertRadiusMiles: 50 };
  const nearby = { lat: 37.8093, lng: -85.4669 }; // Bardstown ~33 mi
  const faraway = { lat: 34.0522, lng: -118.2437 }; // LA

  it("delivers when the sighting is inside the radius", () => {
    expect(withinAlertRadius(nearby, louisville)).toBe(true);
  });

  it("drops when the sighting is outside the radius", () => {
    expect(withinAlertRadius(faraway, louisville)).toBe(false);
  });

  it("falls back to delivering when the recipient has no base location", () => {
    expect(withinAlertRadius(faraway, { alertRadiusMiles: 50 })).toBe(true);
  });

  it("falls back to delivering when the sighting has no coordinates", () => {
    expect(withinAlertRadius({}, louisville)).toBe(true);
  });

  it("uses the default radius when the recipient has none set", () => {
    // Bardstown (~33 mi) is inside the 50-mi default.
    expect(withinAlertRadius(nearby, { baseLat: 38.2527, baseLng: -85.7585 })).toBe(
      true
    );
  });
});
