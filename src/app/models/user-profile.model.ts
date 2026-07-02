import { Timestamp } from '@angular/fire/firestore';
import { SightingVisibility } from './sighting.model';

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
  // Default visibility applied to new sightings (BB-110); overridable per log.
  defaultSightingVisibility?: SightingVisibility;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
