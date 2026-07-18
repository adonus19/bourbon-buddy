import { Timestamp } from '@angular/fire/firestore';

/**
 * My Stores (Epic 24, BB-223) — a private per-user retailer notebook.
 *
 * Manual judgment up front (`priceTier`, `specialties`, `shipmentNotes`),
 * computed *evidence* beside it on the detail page (BB-224, from the user's own
 * `/priceHistory`) — never replacing the manual call: article/mentioned prices
 * are unreliable, so `priceTier` is ALWAYS the user's. Identity is per LOCATION,
 * not per chain: `placeId` when present (BB-187 retailer picker), else
 * `nameNormalized + city`.
 *
 * Collection: `/users/{userId}/stores/{storeId}` — covered by the existing
 * owner-only subcollection wildcard rule (no rules change).
 */

/** Manual price read for a store — never inferred (owner's call). */
export type StorePriceTier = 'underpriced' | 'fair' | 'overpriced';

/** What a store is known for; rendered as selectable chips. */
export type StoreSpecialty =
  | 'store-picks'
  | 'allocated'
  | 'barrel-picks'
  | 'rare-finds';

export interface StoreNote {
  id?: string;
  name: string;
  nameNormalized: string; // dedupe/match key (normalizeBottleName)
  placeId?: string | null; // OSM id from the BB-187 retailer picker, when created that way
  city?: string | null;
  state?: string | null;
  priceTier?: StorePriceTier | null; // ALWAYS manual
  specialties: StoreSpecialty[];
  shipmentNotes?: string | null; // free text ("truck Tuesdays, allocated drop 1st Thursday")
  notes?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
