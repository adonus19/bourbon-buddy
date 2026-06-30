import { Timestamp } from '@angular/fire/firestore';

// Collection: /users/{userId}  (document ID = Firebase Auth UID)
export interface UserProfile {
  id?: string;
  displayName: string;
  email: string;
  avatarUrl?: string | null;
  bio?: string | null;
  homeRegion?: string | null;
  // Social graph (BB-100). Additive/optional — absent on pre-social profiles.
  username?: string | null; // unique handle; mirrors /usernames/{usernameLower}
  isDiscoverable?: boolean; // opt-in to username search; default false
  friendCount?: number; // denormalized, maintained on friend add/remove
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
