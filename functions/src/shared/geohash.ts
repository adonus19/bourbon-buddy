/**
 * Geohash encoding (BB-177). A geohash is a base-32 string where a shared prefix
 * means geographic proximity — cheap to store and to range-query in Firestore,
 * which powers "sightings near me" (BB-179) and proximity alerts (BB-180).
 */
const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

export function isValidLat(lat: unknown): lat is number {
  return typeof lat === "number" && lat >= -90 && lat <= 90;
}

export function isValidLng(lng: unknown): lng is number {
  return typeof lng === "number" && lng >= -180 && lng <= 180;
}

/** Encode coordinates to a geohash of the given precision (default 9 ≈ ±2.4m). */
export function encodeGeohash(lat: number, lng: number, precision = 9): string {
  let latMin = -90;
  let latMax = 90;
  let lngMin = -180;
  let lngMax = 180;
  let hash = "";
  let bits = 0;
  let ch = 0;
  let even = true;

  while (hash.length < precision) {
    if (even) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) {
        ch = (ch << 1) | 1;
        lngMin = mid;
      } else {
        ch = ch << 1;
        lngMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) {
        ch = (ch << 1) | 1;
        latMin = mid;
      } else {
        ch = ch << 1;
        latMax = mid;
      }
    }
    even = !even;
    if (++bits === 5) {
      hash += BASE32[ch];
      bits = 0;
      ch = 0;
    }
  }
  return hash;
}
