import { Timestamp } from '@angular/fire/firestore';

import { BourbonCategory } from './enums';

/**
 * Friends-only in-app sharing (BB-230). What is shared is always the *catalog
 * bottle* — never the sharer's log entry (which carries their price paid, notes,
 * and rating). A `SharedItem` is written to the RECIPIENT's subcollection by the
 * `shareBottle` / `shareList` callables (Admin SDK, cross-user), so it is durable
 * state that outlives the 30-day notification TTL — the notification merely
 * deep-links here. Snapshots, not live subscriptions.
 */

/** What a shared item carries. */
export type SharedItemKind = 'bottle' | 'list';

/** Recipient-side lifecycle: unopened → imported into their own log/list, or dismissed. */
export type SharedItemStatus = 'pending' | 'imported' | 'dismissed';

/** One bottle in a shared hunt-list snapshot (BB-230d). */
export interface SharedListBottle {
  bourbonId: string;
  bottleName: string;
  distillery: string | null;
  category: BourbonCategory | null;
}

/**
 * Stored at /users/{recipientUid}/sharedItems/{id} (BB-230a). Display fields are
 * denormalized by the callable so the "Shared with me" view renders with no
 * extra profile or catalog reads.
 */
export interface SharedItem {
  id?: string;
  kind: SharedItemKind;

  // Who shared it — denormalized from the sharer's public profile.
  fromUid: string;
  fromDisplayName: string | null;
  fromUsername: string | null;
  fromAvatarUrl: string | null;

  // The shared catalog bottle (kind: 'bottle'). The callable findOrCreates the
  // catalog entry server-side so both sides key on the same bourbonId, even for
  // Radar/Dispatch bottles that had none. Absent on a list share.
  bourbonId?: string;
  bottleName?: string;
  distillery?: string | null;
  category?: BourbonCategory | null;

  // The sharer's own rating (0–5), included ONLY when they opt in at share time
  // (BB-230b). Separate opt-in per the locked decision — absent by default.
  sharerRating?: number | null;

  // A frozen hunt-list snapshot (kind: 'list', BB-230d). Not a live subscription
  // — cross-user reads on wishlistEntries are owner-only, so the list is captured
  // at share time.
  bottles?: SharedListBottle[];
  bottleCount?: number;

  // Optional short message from the sharer.
  note?: string | null;

  status: SharedItemStatus;
  createdAt: Timestamp;
}
