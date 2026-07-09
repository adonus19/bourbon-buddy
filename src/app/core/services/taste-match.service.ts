import { Injectable, computed, inject } from '@angular/core';

import { LogEntryService } from './log-entry.service';
import {
  buildTasteVector,
  matchTaste,
} from '../../shared/utils/taste-match';

/**
 * Taste Match (BB-199) — client side. The vector is a pure derivation of the
 * already-loaded entries signal: no Firestore reads, no persistence here. The
 * server keeps its own copy on the profile doc (functions/src/taste, trigger
 * on log-entry writes) for sighting alerts — this service only powers badges.
 */
@Injectable({ providedIn: 'root' })
export class TasteMatchService {
  private readonly log = inject(LogEntryService);

  /** Null while cold-starting (< 3 liked, tagged entries). */
  readonly vector = computed(() => buildTasteVector(this.log.entries()));

  readonly enabled = computed(() => this.vector() !== null);

  /**
   * Whether a bottle's flavor tags match the user's taste; `tags` lists the
   * shared tags (strongest preference first) so the badge explains itself.
   */
  matches(tags: {
    nose: string[];
    palate: string[];
    finish: string[];
  } | null | undefined): { matched: boolean; tags: string[] } {
    return matchTaste(this.vector(), tags);
  }
}
