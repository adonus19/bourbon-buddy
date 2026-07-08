/**
 * Presence attestation (BB-191). A sighting is "spotted on-site" when the
 * spotter's captured device coordinates put them physically at the store they
 * picked from the nearby-retailer list. Derived SERVER-SIDE ONLY inside
 * `logSighting` — the client never sends `presenceVerified`, and the rules pin
 * it on update — so an at-home report can never carry the badge.
 *
 * Honest limits: coordinates come from the client, so a determined attacker
 * with a spoofed geolocation could still fake proximity. App Check (BB-121)
 * plus the sighting rate limit make that a scripted-attack problem rather than
 * a casual one; the badge is presented as "attested", not "proven".
 */
import { haversineMeters, LatLng } from "../shared/geo";

/** Walking-around-the-shelves tolerance: GPS drift + big-box parking lots. */
export const PRESENCE_RADIUS_M = 150;

export function isPresenceVerified(
  user: { lat: number | null; lng: number | null },
  store: LatLng | null | undefined,
  radiusM: number = PRESENCE_RADIUS_M
): boolean {
  if (user.lat == null || user.lng == null || store == null) {
    return false;
  }
  return (
    haversineMeters({ lat: user.lat, lng: user.lng }, store) <= radiusM
  );
}
