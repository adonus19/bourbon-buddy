import {
  buildOverpassQuery,
  CACHE_GEOHASH_PRECISION,
  isCacheFresh,
  MAX_RESULTS,
  parseOverpassRetailers,
  retailerCacheKey,
} from "./overpass";

describe("buildOverpassQuery", () => {
  it("targets the retail shop tags around the point", () => {
    const q = buildOverpassQuery(42.5, -71.1, 2000);
    expect(q).toContain("alcohol|wine|supermarket|convenience");
    expect(q).toContain("around:2000,42.5,-71.1");
    expect(q).toContain("out center");
  });
});

describe("retailerCacheKey", () => {
  it("is a geohash prefix of the configured precision", () => {
    const key = retailerCacheKey(42.5, -71.1);
    expect(key).toHaveLength(CACHE_GEOHASH_PRECISION);
    // Same cell → same key; a far-away point → different key.
    expect(retailerCacheKey(42.5001, -71.1001)).toBe(key);
    expect(retailerCacheKey(40.0, -75.0)).not.toBe(key);
  });
});

describe("parseOverpassRetailers", () => {
  const origin = { lat: 42.5, lng: -71.1 };

  it("keeps named POIs, reads ways via center, and sorts nearest first", () => {
    const json = {
      elements: [
        // farther node
        { lat: 42.52, lon: -71.1, tags: { name: "Far Wine", shop: "wine" } },
        // nearer way (uses center)
        {
          type: "way",
          center: { lat: 42.501, lon: -71.1 },
          tags: {
            name: "Near Liquors",
            shop: "alcohol",
            "addr:city": "Lowell",
            "addr:state": "MA",
          },
        },
      ],
    };
    const out = parseOverpassRetailers(json, origin);
    expect(out.map((r) => r.name)).toEqual(["Near Liquors", "Far Wine"]);
    expect(out[0]).toMatchObject({ kind: "alcohol", city: "Lowell", state: "MA" });
    expect(out[1]).toMatchObject({ city: null, state: null });
  });

  it("drops unnamed and coordinate-less elements, and dedupes by name", () => {
    const json = {
      elements: [
        { lat: 42.5, lon: -71.1, tags: { shop: "convenience" } }, // no name
        { tags: { name: "No Coords", shop: "wine" } }, // no lat/lng
        { lat: 42.5, lon: -71.1, tags: { name: "Cumbys", shop: "convenience" } },
        { lat: 42.6, lon: -71.2, tags: { name: "Cumbys", shop: "convenience" } }, // dupe name
      ],
    };
    const out = parseOverpassRetailers(json, origin);
    expect(out.map((r) => r.name)).toEqual(["Cumbys"]);
  });

  it("returns [] for a malformed response and caps the list", () => {
    expect(parseOverpassRetailers(null, origin)).toEqual([]);
    expect(parseOverpassRetailers({}, origin)).toEqual([]);
    const many = {
      elements: Array.from({ length: MAX_RESULTS + 10 }, (_, i) => ({
        lat: 42.5 + i * 0.001,
        lon: -71.1,
        tags: { name: `Store ${i}`, shop: "wine" },
      })),
    };
    expect(parseOverpassRetailers(many, origin)).toHaveLength(MAX_RESULTS);
  });
});

describe("isCacheFresh", () => {
  const now = 1_000_000_000_000;
  const ttl = 7 * 24 * 60 * 60 * 1000;
  it("is fresh within the TTL, stale beyond it, and false when absent", () => {
    expect(isCacheFresh(now - 60_000, now, ttl)).toBe(true);
    expect(isCacheFresh(now - ttl - 1, now, ttl)).toBe(false);
    expect(isCacheFresh(null, now, ttl)).toBe(false);
    expect(isCacheFresh(undefined, now, ttl)).toBe(false);
  });
});
