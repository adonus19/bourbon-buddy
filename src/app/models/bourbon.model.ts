import { Timestamp } from '@angular/fire/firestore';
import { BourbonCategory, BourbonSubType } from './enums';

// Collection: /bourbons/{bourbonId}  — shared reference catalog.
export interface Bourbon {
  id?: string;
  name: string;
  nameLowercase: string; // for case-insensitive search queries
  distillery?: string | null;
  bottler?: string | null;
  category?: BourbonCategory | null;
  subType?: BourbonSubType | null;
  ageStatement?: number | null;
  isNas: boolean;
  proof?: number | null;
  msrp?: number | null;
  series?: string | null;
  createdAt: Timestamp;
  createdByUserId: string;
}
