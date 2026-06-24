import { Timestamp } from '@angular/fire/firestore';

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
}
