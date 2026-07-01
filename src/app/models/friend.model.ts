import { Timestamp } from '@angular/fire/firestore';

/**
 * A hydrated friend for list display (BB-103): the `/users/{uid}/friends/{uid}`
 * edge resolved against the friend's public profile. Kept fresh by reading the
 * profile on load rather than denormalizing onto the edge (friend lists are
 * small, so a handful of keyed reads beats stale names).
 */
export interface FriendView {
  uid: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  homeRegion: string | null;
}

/**
 * Stored at /users/{uid}/blocks/{blockedUid} (BB-103). Display fields are
 * denormalized by the `blockUser` callable so the Blocked list renders with no
 * extra profile reads.
 */
export interface BlockedUser {
  id?: string; // = blockedUid
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  createdAt: Timestamp;
}
