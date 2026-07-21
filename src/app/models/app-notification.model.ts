import { Timestamp } from '@angular/fire/firestore';

/** The notification categories that can land in the inbox (mirror of BB-091). */
export type NotificationType =
  | 'sightingMatch'
  | 'priceAlert'
  | 'friendRequest'
  | 'newsDigest'
  // Gated access (BB-210): admin's new-signup alert AND the "you're in"
  // welcome. Operational — the server delivers it regardless of prefs.
  | 'accessRequest'
  // Friends-only sharing (BB-230): a friend shared a bottle or their hunt list.
  | 'bottleShare'
  | 'listShare';

/**
 * In-app inbox record (BB-113). Written at /users/{uid}/notifications/{id} by
 * the send-helper alongside every push, so a missed notification is still
 * recoverable. Auto-expired (~30 days) by a scheduled cleanup function.
 */
export interface AppNotification {
  id?: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null; // in-app deep-link path, e.g. "/wishlist/abc"
  read: boolean;
  createdAt: Timestamp;
}
