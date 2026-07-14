import { Timestamp } from '@angular/fire/firestore';

/**
 * Collection: /accessAllowlist/{emailLower}  (BB-210/212)
 *
 * Owner-managed signup allowlist. The document ID is the LOWERCASED email —
 * uniqueness for free. A new account whose verified email matches a doc here
 * is auto-approved by the access trigger; `approveUser` upserts an entry so a
 * deleted-and-recreated account self-heals. Admin-claim-only in rules.
 */
export interface AllowlistEntry {
  /** Document ID: the lowercased email. */
  id?: string;
  /** Who this is, e.g. "Mike from work". */
  note: string | null;
  addedAt: Timestamp;
}
