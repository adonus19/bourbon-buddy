/**
 * Store identity (BB-223). A store note is per LOCATION, not per chain: two
 * "Total Wine" branches in different cities are different notes. Identity is
 * `placeId` when the store was created from the BB-187 retailer picker, else
 * the `nameNormalized + city` pair. Pure so the service dedupe and the BB-225
 * sighting→store handoff can share one match rule.
 */

export interface StoreIdentity {
  placeId?: string | null;
  nameNormalized: string;
  city?: string | null;
}

/** Stable match key for a store location — placeId first, else name+city. */
export function storeIdentityKey(s: StoreIdentity): string {
  if (s.placeId) {
    return `place:${s.placeId}`;
  }
  const city = (s.city ?? '').trim().toLowerCase();
  return `name:${s.nameNormalized}|${city}`;
}

/** Find an existing store matching a candidate location, or undefined. */
export function matchStore<T extends StoreIdentity>(
  stores: T[],
  candidate: StoreIdentity
): T | undefined {
  const key = storeIdentityKey(candidate);
  return stores.find((s) => storeIdentityKey(s) === key);
}
