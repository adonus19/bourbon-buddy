import { Timestamp } from '@angular/fire/firestore';

export type FriendRequestStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'cancelled';

/**
 * Collection: /friendRequests/{requestId}  (BB-101/102)
 *
 * Created only by the `sendFriendRequest` callable (which enforces the self/
 * duplicate/block checks and rate limit) and transitioned only by
 * `respondToFriendRequest`. Both parties' public display fields are denormalized
 * onto the doc so the incoming/outgoing lists render with no extra profile reads.
 */
export interface FriendRequest {
  id?: string;
  fromUid: string;
  toUid: string;
  status: FriendRequestStatus;
  fromDisplayName?: string | null;
  fromUsername?: string | null;
  fromAvatarUrl?: string | null;
  toDisplayName?: string | null;
  toUsername?: string | null;
  toAvatarUrl?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
