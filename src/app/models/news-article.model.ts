import { Timestamp } from '@angular/fire/firestore';
import { BourbonCategory } from './enums';

/** How the AI classified an article's source (BB-220). Trust flows from it:
 * flavor seeds/verdicts from press releases are dropped server-side. */
export type ArticleType =
  | 'press_release'
  | 'independent_review'
  | 'listicle'
  | 'news';

/** The article author's opinion of a bottle (BB-220); reviews/listicles only. */
export type BottleVerdict = 'rave' | 'positive' | 'mixed' | 'negative';

/** A bottle the AI found mentioned in an article (BB-130), matched to catalog. */
export interface MentionedBottle {
  name: string; // as written in the article
  bourbonId?: string | null; // catalog match, or null if not yet in /bourbons
  distillery?: string | null; // AI-inferred, to pre-fill the hunt-list entry
  category?: BourbonCategory | null; // AI-inferred (validated against the enum)
  // Catalog flavor tags denormalized at extraction (BB-199) so chips can show
  // the Taste Match badge without a read. Absent on pre-BB-199 articles.
  flavor?: { nose: string[]; palate: string[]; finish: string[] } | null;
  verdict?: BottleVerdict | null; // BB-220; absent pre-v3 extractions
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
  articleType?: ArticleType; // source classification (BB-220); absent pre-v3
}
