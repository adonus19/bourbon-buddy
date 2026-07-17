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

/**
 * Precomputed "Similar bottles" neighbor (BB-197): cached on the catalog doc
 * by the server whenever flavor profiles change; the client only reads it.
 * `sharedTags` are the overlapping canonical flavor tags, palate-first — shown
 * so every recommendation explains itself.
 */
export interface SimilarBottle {
  bourbonId: string;
  name: string;
  category: BourbonCategory | null;
  sharedTags: string[];
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
  // Release cadence stated in a news article (BB-219). Server-written by the
  // extraction pipeline (verbatim-guarded, null-only backfill).
  releaseType?: 'flagship' | 'annual' | 'limited' | 'single_barrel' | null;
  upc?: string[]; // crowdsourced UPC/EAN barcodes for scan lookup (BB-175)
  flavorProfile?: FlavorProfile | null; // AI-suggested tasting notes (BB-185)
  flavorEnrichedAt?: Timestamp | null; // set once enriched; gates re-enrichment
  similarBottles?: SimilarBottle[]; // precomputed neighbors (BB-197), server-written
  similarComputedAt?: Timestamp | null;
  createdAt: Timestamp;
  createdByUserId: string;
}
