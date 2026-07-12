import { Timestamp } from '@angular/fire/firestore';

import { SightingVisibility } from './sighting.model';

/**
 * A durable, immutable price observation (BB-202). The `logSighting` callable
 * mints one per sighting into `/priceHistory` so crowd prices survive the 30-day
 * sighting purge — this is the data that backs the Price History timeline
 * (Epic 19), read via `PriceHistoryService.priceHistoryForBottle()`.
 *
 * Write-once server-side: the client never creates or edits these (rules deny
 * all client writes), so there is no `markedStaleManually` / freshness here —
 * a price point is a permanent fact, not a live shelf state.
 */
export interface PriceHistoryPoint {
  id?: string;
  bourbonId: string; // catalog match key (same as the source sighting)
  price: number;
  sightingDate: Timestamp; // when the price was observed
  storeName?: string | null;
  city?: string | null;
  state?: string | null;
  spotterUid: string; // who observed it (for visibility filtering)
  visibility: SightingVisibility; // copied from the sighting at mint time
  sourceSightingId?: string | null; // the sighting that minted this point
  createdAt: Timestamp;
}
