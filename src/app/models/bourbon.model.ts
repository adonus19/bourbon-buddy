import { Timestamp } from '@angular/fire/firestore';
import { BourbonCategory, BourbonSubType } from './enums';

/**
 * AI-generated flavor profile cached on the catalog (BB-185). Tags are canonical
 * labels from the BB-181 flavor wheel (never verbatim third-party prose). It's a
 * *suggestion* seed: BB-186 pre-fills these when logging, and the user's own
 * confirmed tags live on their log entry, not here. `source: 'ai'` marks it as
 * suggested rather than user-confirmed.
 */
export interface FlavorProfile {
  nose: string[];
  palate: string[];
  finish: string[];
  source: 'ai';
  model: string; // provenance, e.g. 'llama-3.1-8b-instant'
  generatedAt: Timestamp;
}

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
  upc?: string[]; // crowdsourced UPC/EAN barcodes for scan lookup (BB-175)
  flavorProfile?: FlavorProfile | null; // AI-suggested tasting notes (BB-185)
  flavorEnrichedAt?: Timestamp | null; // set once enriched; gates re-enrichment
  createdAt: Timestamp;
  createdByUserId: string;
}
