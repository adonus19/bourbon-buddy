import { Timestamp } from '@angular/fire/firestore';

/**
 * Collection: /publicProfiles/{userId}  (document ID = Auth UID)
 *
 * A signed-in-readable projection of a user's profile holding ONLY public
 * fields. Firestore rules can't return a subset of a document, so the public
 * view lives in its own doc, mirrored from /users/{uid} by the owner. It never
 * contains email, bio, log, or wishlist data. (BB-100)
 */
export interface PublicProfile {
  id?: string; // = uid
  displayName: string;
  username: string | null; // display form; uniqueness keyed by usernameLower
  usernameLower: string | null; // mirrors the /usernames/{usernameLower} key
  avatarUrl: string | null;
  homeRegion: string | null;
  isDiscoverable: boolean; // opt-in to username search; default false
  friendCount: number; // denormalized; maintained by friend callables
  updatedAt: Timestamp;
}

/**
 * Collection: /usernames/{usernameLower}  (document ID = lowercased handle)
 *
 * Reservation doc that enforces unique, case-insensitive handles. Written
 * transactionally when a username is claimed or changed (BB-100).
 */
export interface UsernameReservation {
  uid: string;
  createdAt: Timestamp;
}
