import { encodeGeohash, isValidLat, isValidLng } from "./geohash";

describe("encodeGeohash", () => {
  it("matches known geohash vectors", () => {
    // Classic reference: (42.6, -5.6) → "ezs42".
    expect(encodeGeohash(42.6, -5.6, 5)).toBe("ezs42");
    // Wikipedia example coordinates.
    expect(encodeGeohash(57.64911, 10.40744, 11)).toBe("u4pruydqqvj");
  });

  it("respects the requested precision", () => {
    const full = encodeGeohash(42.6, -5.6, 9);
    expect(full).toHaveLength(9);
    expect(full.startsWith("ezs42")).toBe(true);
  });

  it("encodes the origin and extremes without error", () => {
    expect(encodeGeohash(0, 0, 6)).toHaveLength(6);
    expect(encodeGeohash(-90, -180, 6)).toHaveLength(6);
    expect(encodeGeohash(90, 180, 6)).toHaveLength(6);
  });
});

describe("isValidLat / isValidLng", () => {
  it("accepts in-range values", () => {
    expect(isValidLat(42.6)).toBe(true);
    expect(isValidLng(-5.6)).toBe(true);
    expect(isValidLat(-90)).toBe(true);
    expect(isValidLng(180)).toBe(true);
  });

  it("rejects out-of-range or non-numeric values", () => {
    expect(isValidLat(91)).toBe(false);
    expect(isValidLat(-90.1)).toBe(false);
    expect(isValidLng(181)).toBe(false);
    expect(isValidLat("42" as unknown)).toBe(false);
    expect(isValidLng(null)).toBe(false);
    expect(isValidLat(NaN)).toBe(false);
  });
});
