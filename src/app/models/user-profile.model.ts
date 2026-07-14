import { Timestamp } from '@angular/fire/firestore';
import { SightingVisibility } from './sighting.model';

/**
 * Gated access (BB-210). UI mirror of the `approved` custom claim — written
 * ONLY by the Admin SDK (access trigger/callables/backfill); Security Rules
 * reject any owner write touching it. Absent on legacy docs until backfilled.
 */
export type AccessStatus = 'pending' | 'approved' | 'denied';

// Collection: /users/{userId}  (document ID = Firebase Auth UID)
export interface UserProfile {
  id?: string;
  displayName: string;
  email: string;
  accessStatus?: AccessStatus;
  avatarUrl?: string | null;
  bio?: string | null;
  homeRegion?: string | null;
  // Social graph (BB-100). Additive/optional — absent on pre-social profiles.
  username?: string | null; // unique handle; mirrors /usernames/{usernameLower}
  isDiscoverable?: boolean; // opt-in to username search; default false
  friendCount?: number; // denormalized, maintained on friend add/remove
  // Default visibility applied to new sightings (BB-110); overridable per log.
  defaultSightingVisibility?: SightingVisibility;
  // Proximity alert prefs (BB-178). Opt-in base location + max notify distance;
  // used only by sighting match-alert filtering (BB-180). Label is display-only.
  baseLat?: number | null;
  baseLng?: number | null;
  baseLocationLabel?: string | null; // e.g. "Louisville, KY"
  alertRadiusMiles?: number | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
