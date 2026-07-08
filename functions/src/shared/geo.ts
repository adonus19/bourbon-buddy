/** Geo helpers for proximity-filtered alerts (BB-180). */

export interface LatLng {
  lat: number;
  lng: number;
}

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

const METERS_PER_MILE = 1609.344;

/** Great-circle distance between two points, in meters. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  return haversineMiles(a, b) * METERS_PER_MILE;
}

export const DEFAULT_RADIUS_MILES = 50;

/**
 * Whether a sighting should reach a recipient given their opt-in base location
 * and alert radius (BB-180). Fails **open**: if either the sighting has no
 * coordinates or the recipient has no base location, we can't filter, so we
 * deliver (the pre-geo behavior).
 */
export function withinAlertRadius(
  sighting: { lat?: unknown; lng?: unknown },
  recipient: { baseLat?: unknown; baseLng?: unknown; alertRadiusMiles?: unknown },
  defaultRadiusMiles = DEFAULT_RADIUS_MILES
): boolean {
  const { lat: sLat, lng: sLng } = sighting;
  const { baseLat: rLat, baseLng: rLng } = recipient;
  if (
    typeof sLat !== "number" ||
    typeof sLng !== "number" ||
    typeof rLat !== "number" ||
    typeof rLng !== "number"
  ) {
    return true;
  }
  const radius =
    typeof recipient.alertRadiusMiles === "number"
      ? recipient.alertRadiusMiles
      : defaultRadiusMiles;
  return haversineMiles({ lat: sLat, lng: sLng }, { lat: rLat, lng: rLng }) <= radius;
}
