/** Geo distance helpers (BB-179 / BB-180). */

export interface LatLng {
  lat: number;
  lng: number;
}

// Mean Earth radius in miles.
const EARTH_RADIUS_MI = 3958.7613;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance between two points, in miles. */
export function haversineMiles(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** True when `point` is within `radiusMiles` of `center`. */
export function isWithinMiles(
  center: LatLng,
  point: LatLng,
  radiusMiles: number
): boolean {
  return haversineMiles(center, point) <= radiusMiles;
}
