import { Timestamp } from '@angular/fire/firestore';

/** Who may see a sighting. Friends-visibility is wired up in BB-110. */
export type SightingVisibility = 'private' | 'friends';

// Collection: /sightings/{sightingId}  (BB-161 — first-class, catalog-keyed).
// Decoupled from any wishlist: a sighting is an observation about a catalog
// bottle, keyed by bourbonId, that any user can log for any bottle. A wishlist
// entry's sightings are a query by bourbonId, not a stored subcollection.
//
// Staleness is computed on read:
//   isStale = markedStaleManually || (today - sightingDate > 30 days)
export interface Sighting {
  id?: string;
  bourbonId: string; // catalog match key (BB-160 canonicalized)
  bourbonName?: string | null; // denormalized for display
  spotterUid: string; // who logged it
  storeName: string;
  price: number;
  sightingDate: Timestamp;
  city?: string | null;
  state?: string | null;
  notes?: string | null;
  // Opt-in location (BB-177). Coordinates power "near me" / map / proximity
  // features; geohash is derived server-side. Never shown as raw numbers in UI.
  lat?: number | null;
  lng?: number | null;
  geohash?: string | null;
  // Presence attestation (BB-191). Server-derived, never client-written: true
  // when the spotter's device coords put them at the store they picked from
  // the nearby-retailer list. Powers the "Spotted on-site" trust badge.
  storePlaceId?: string | null;
  presenceVerified?: boolean;
  // Community confirmation (BB-194). Denormalized by the confirmSighting
  // callable (votes live in a server-only subcollection); pinned in rules.
  // A confirm refreshes the freshness clock via lastConfirmedAt; enough
  // disputes force the stale tier — see sightingFreshness().
  confirmCount?: number;
  disputeCount?: number;
  lastConfirmedAt?: Timestamp | null;
  markedStaleManually: boolean;
  visibility: SightingVisibility;
  createdAt: Timestamp;
}
