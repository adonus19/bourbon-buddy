import { Timestamp } from '@angular/fire/firestore';
import { SightingVisibility } from './sighting.model';

/**
 * Gated access (BB-210). UI mirror of the `approved` custom claim — written
 * ONLY by the Admin SDK (access trigger/callables/backfill); Security Rules
 * reject any owner write touching it. Absent on legacy docs until backfilled.
 */
export type AccessStatus = 'pending' | 'approved' | 'denied';

/**
 * Discreet Total Spent (BB-229). How the user wants hiding to behave:
 *  - `partner` — hide fast, reveal in one tap. Someone may be looking over your
 *    shoulder, so a puzzle is worse than useless and a loud badge is worse still.
 *  - `self`    — the escalating gauntlet; you asked to be stopped.
 *  - `plain`   — just hide it, no bit.
 */
export type SpendPrivacyMode = 'partner' | 'self' | 'plain';

/**
 * Stored on the user doc so the setting follows the account across devices.
 * Read from the profile listener AuthService already holds — zero extra reads.
 */
export interface SpendPrivacy {
  hidden: boolean;
  mode: SpendPrivacyMode;
  /**
   * Completed gauntlet runs (BB-229c). NOT a position in the ladder — a reveal
   * runs all seven stages every time, so there is nothing to resume. Kept as a
   * counter so escalating flavor text can key off it later without a migration.
   */
  gauntletRuns: number;
  /** True once the first-run "who are we hiding from?" modal was answered. */
  configured: boolean;
  /** Last successful reveal. */
  lastRevealAt?: Timestamp | null;
}

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
  // Discreet Total Spent (BB-229). Absent on every pre-feature profile, which
  // correctly reads as "not hidden".
  spendPrivacy?: Partial<SpendPrivacy>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
