import { Timestamp } from '@angular/fire/firestore';
import {
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
  series?: string | null;

  // Purchase / experience
  entryType: EntryType;
  didNotPurchase: boolean;
  purchasePrice?: number | null;
  purchaseLocation?: string | null;
  purchaseDate?: Timestamp | null;
  bottleSizeMl?: number | null; // 50, 200, 375, 750, 1000, 1750
  bottleRemainingPct?: number | null; // 100, 75, 50, 25, 0

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

  // Computed
  valueScore?: number | null; // (rating/5)*100/purchasePrice; null if missing data

  // Metadata
  entryDate: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
