import { Timestamp } from '@angular/fire/firestore';
import { BourbonCategory } from './enums';

/** A bottle the AI found mentioned in an article (BB-130), matched to catalog. */
export interface MentionedBottle {
  name: string; // as written in the article
  bourbonId?: string | null; // catalog match, or null if not yet in /bourbons
  distillery?: string | null; // AI-inferred, to pre-fill the hunt-list entry
  category?: BourbonCategory | null; // AI-inferred (validated against the enum)
}

// Collection: /newsArticles/{articleId}  (document ID = URL-derived hash)
// Written only by the RSS-fetcher Cloud Function; read by all auth users.
export interface NewsArticle {
  id?: string;
  sourceName: string;
  headline: string;
  excerpt?: string | null;
  url: string;
  thumbnailUrl?: string | null;
  publishedAt?: Timestamp | null;
  fetchedAt: Timestamp;
  categories: string[];
  keywords: string[];
  // AI Find Bottles (BB-130): cached on the article, populated once after fetch.
  mentionedBottles?: MentionedBottle[];
}
