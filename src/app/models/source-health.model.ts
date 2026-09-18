import { Timestamp } from '@angular/fire/firestore';

// Collection: /sourceHealth/{sourceName}
// Written only by the fetchRssFeeds Cloud Function; readable by admins only.
/**
 * Per-source ingest health (BB-245). The zero-item warning added in BB-240 only
 * reaches Cloud Logging, which nobody watches — this is the same signal in a
 * place the owner actually looks, and it keeps the two facts a log line can't:
 * which source, and since when.
 */
export interface SourceHealth {
  /** Doc id and display name — matches RSS_SOURCES[].name. */
  name: string;
  lastRunAt: Timestamp;
  /** Articles written on the most recent run. Zero is the warning sign. */
  itemCount: number;
  /** Last run that produced at least one article; absent if it never has. */
  lastSuccessAt?: Timestamp | null;
  /** Consecutive runs that produced nothing. Reset to 0 by any successful run. */
  consecutiveZeroRuns: number;
  /** Populated when the source threw rather than returning nothing. */
  lastError?: string | null;
}
