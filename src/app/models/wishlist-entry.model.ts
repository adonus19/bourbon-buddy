import { Timestamp } from '@angular/fire/firestore';
import {
  BourbonCategory,
  BourbonSubType,
  WishlistPriority,
  WishlistStatus,
} from './enums';

export interface ReviewLink {
  url: string;
  label?: string | null;
}

// Subcollection: /users/{userId}/wishlistEntries/{entryId}
export interface WishlistEntry {
  id?: string;

  // Core identity
  bourbonId: string;
  bourbonName: string;
  distillery?: string | null;
  category?: BourbonCategory | null;
  subType?: BourbonSubType | null;
  msrp?: number | null;

  // Research
  externalTastingNotes?: string | null;
  reviewLinks: ReviewLink[];
  personalNotes?: string | null;
  discoverySource?: string | null;
  discoveryUrl?: string | null;

  // Priority
  priority: WishlistPriority;
  status: WishlistStatus;

  // Computed / cached
  bestSightingPrice?: number | null; // cached lowest non-stale price

  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
