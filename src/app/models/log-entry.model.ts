import { Timestamp } from '@angular/fire/firestore';
import {
  BottleStatus,
  BourbonCategory,
  BourbonSubType,
  EntryType,
  FinishLength,
  WouldBuyAgain,
} from './enums';

// Subcollection: /users/{userId}/logEntries/{entryId}
export interface LogEntry {
  id?: string;

  // Core identity
  bourbonId: string;
  bourbonName: string;
  distillery?: string | null;
  bottler?: string | null;
  category: BourbonCategory;
  subType?: BourbonSubType | null;

  // Bottle details
  ageStatement?: number | null; // years; null if NAS
  isNas: boolean;
  proof?: number | null;
  mashBillCorn?: number | null;
  mashBillRye?: number | null;
  mashBillWheat?: number | null;
  mashBillMalt?: number | null;
  batchNumber?: string | null;
  barrelNumber?: string | null;
  barrelLabel?: string | null; // store-pick label, e.g. "Total Wine Pick" (BB-195)
  series?: string | null;

  // Purchase / experience
  entryType: EntryType;
  didNotPurchase: boolean;
  purchasePrice?: number | null;
  purchaseLocation?: string | null;
  purchaseDate?: Timestamp | null;
  bottleSizeMl?: number | null; // 50, 200, 375, 750, 1000, 1750
  bottleRemainingPct?: number | null; // 100, 75, 50, 25, 0

  // Bottle lifecycle (BB-191) — owned bottles only; null/absent for non-owned.
  bottleStatus?: BottleStatus | null; // 'open' | 'finished'
  finishedAt?: Timestamp | null; // "kill" date; enables time-to-kill
  repurchaseOfEntryId?: string | null; // lineage to the prior instance on a rebuy (BB-193)

  // Ratings and notes
  rating?: number | null; // 0.5 – 5.0, half-step increments
  wouldBuyAgain?: WouldBuyAgain | null;
  noseNotes?: string | null;
  noseTags: string[];
  palateTags: string[];
  palateNotes?: string | null;
  finishTags: string[];
  finishNotes?: string | null;
  finishLength?: FinishLength | null;
  personalNotes?: string | null;
  labelPhotoUrl?: string | null;

  // Computed / denormalized
  valueScore?: number | null; // (rating/5)*100/purchasePrice; null if missing data
  lastPouredAt?: Timestamp | null; // latest pour session's date; null if none

  // Metadata
  entryDate: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
