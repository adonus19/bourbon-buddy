import { Timestamp } from '@angular/fire/firestore';

/** A bottle the AI found mentioned in an article (BB-130), matched to catalog. */
export interface MentionedBottle {
  name: string; // as written in the article
  bourbonId?: string | null; // catalog match, or null if not yet in /bourbons
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
