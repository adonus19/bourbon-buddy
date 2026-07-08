/**
 * OpenStreetMap Overpass helpers for the nearby-retailer picker (BB-187).
 *
 * Overpass is purpose-built for "category POIs near a point". These are the pure
 * pieces — query building, response parsing, and the geohash cache key — kept
 * separate from the callable/network/Firestore so they're unit-testable. Results
 * are cached by geohash cell to respect Overpass fair-use.
 */
import { encodeGeohash } from "../shared/geohash";
import { haversineMiles, LatLng } from "../shared/geo";

export interface Retailer {
  name: string;
  lat: number;
  lng: number;
  kind: string; // OSM shop tag: alcohol | wine | supermarket | convenience
  city: string | null;
  state: string | null;
}

// Retailers only this pass (bars/restaurants are BB-189).
export const RETAILER_SHOP_TAGS = [
  "alcohol",
  "wine",
  "supermarket",
  "convenience",
];
export const SEARCH_RADIUS_M = 2500;
export const MAX_RESULTS = 25;
// ~1.2 km cells: nearby captures share a cache entry without being misleadingly
// coarse. Two sightings in the same cell reuse one Overpass call.
export const CACHE_GEOHASH_PRECISION = 6;
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Geohash-cell cache key for a coordinate. */
export function retailerCacheKey(lat: number, lng: number): string {
  return encodeGeohash(lat, lng, CACHE_GEOHASH_PRECISION);
}

/** Build the Overpass QL query for retail POIs around a point. */
export function buildOverpassQuery(
  lat: number,
  lng: number,
  radiusM: number = SEARCH_RADIUS_M
): string {
  const filter = RETAILER_SHOP_TAGS.join("|");
  // nwr = node/way/relation; `out center` yields a centroid for ways/relations.
  return (
    "[out:json][timeout:25];" +
    `(nwr["shop"~"^(${filter})$"](around:${radiusM},${lat},${lng}););` +
    `out center ${MAX_RESULTS * 2};`
  );
}

interface OverpassElement {
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
}

/** Parse an Overpass response into named, deduped retailers, nearest first. */
export function parseOverpassRetailers(
  json: unknown,
  origin: LatLng
): Retailer[] {
  const elements = (json as { elements?: unknown[] })?.elements;
  if (!Array.isArray(elements)) {
    return [];
  }
  const seen = new Set<string>();
  const out: Retailer[] = [];
  for (const raw of elements) {
    const el = raw as OverpassElement;
    const tags = el.tags ?? {};
    const name = (tags["name"] ?? "").trim();
    if (!name) {
      continue; // unnamed POIs aren't useful to a user
    }
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (typeof lat !== "number" || typeof lng !== "number") {
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      continue; // collapse duplicate/chain entries by name
    }
    seen.add(key);
    out.push({
      name,
      lat,
      lng,
      kind: typeof tags["shop"] === "string" ? tags["shop"] : "",
      city: tags["addr:city"] ?? null,
      state: tags["addr:state"] ?? null,
    });
  }
  out.sort(
    (a, b) =>
      haversineMiles(origin, { lat: a.lat, lng: a.lng }) -
      haversineMiles(origin, { lat: b.lat, lng: b.lng })
  );
  return out.slice(0, MAX_RESULTS);
}

/** Whether a cached result is still within its TTL. */
export function isCacheFresh(
  fetchedAtMs: number | null | undefined,
  nowMs: number,
  ttlMs: number = CACHE_TTL_MS
): boolean {
  return fetchedAtMs != null && nowMs - fetchedAtMs < ttlMs;
}
