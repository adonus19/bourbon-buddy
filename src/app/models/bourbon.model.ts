import { Timestamp } from '@angular/fire/firestore';
import { BourbonCategory, BourbonSubType } from './enums';

// Collection: /bourbons/{bourbonId}  — shared reference catalog.
export interface Bourbon {
  id?: string;
  name: string;
  nameLowercase: string; // for case-insensitive prefix search (autocomplete)
  nameNormalized?: string; // canonical dedupe key (BB-160): case/punct/diacritics folded
  aliases?: string[]; // normalized names merged into this entry (BB-160)
  canonicalId?: string | null; // set on a duplicate merged into another (BB-160)
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
