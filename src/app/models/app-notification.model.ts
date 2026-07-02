import { Timestamp } from '@angular/fire/firestore';

/** The notification categories that can land in the inbox (mirror of BB-091). */
export type NotificationType =
  | 'sightingMatch'
  | 'priceAlert'
  | 'friendRequest'
  | 'newsDigest';

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
