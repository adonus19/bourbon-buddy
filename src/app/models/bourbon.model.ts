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
  // Trust-tier provenance (BB-222), absent on legacy profiles. tagCounts =
  // review/listicle mentions (load-bearing); marketingTagCounts = producer
  // claims (display-only, weak corroborator — never in the arrays above).
  tagCounts?: Record<string, number>;
  marketingTagCounts?: Record<string, number>;
  seededArticleIds?: string[];
  reviewCount?: number;
  // Press-release articles that seeded (BB-227). Producer notes now enter the
  // arrays (a human transcribed them — better than an AI guess) but stay labelled
  // "Distillery notes" via this count, distinct from independent reviews.
  producerCount?: number;
  // Community tier (BB-188), the TOP of the trust ladder — users' own confirmed
  // tags aggregated across people (server-written by the log-entry trigger).
  // `userTags` is kept separate from the arrays above so it can be recomputed
  // non-destructively; only counts ≥ the contributor floor (2) are stored, and
  // nothing per-user is ever recorded.
  userTags?: { nose: string[]; palate: string[]; finish: string[] };
  userTagCounts?: Record<string, number>; // distinct-user count per tag
  contributorCount?: number; // distinct users who confirmed any tag
}

/**
 * One article's opinion of this bottle (BB-220/221), cached on the catalog in
 * a map keyed by articleId — idempotent under re-extraction, capped server-side
 * (~20). Aggregates (counts, averages) are always derived client-side.
 */
export interface CriticSignal {
  score: number | null; // normalized 0–100 (BB-221); null until then
  verdict: 'rave' | 'positive' | 'mixed' | 'negative' | null;
  sourceName: string;
  at: Timestamp;
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
  criticSignals?: Record<string, CriticSignal>; // per-article opinions (BB-220/221), server-written
  createdAt: Timestamp;
  createdByUserId: string;
}
