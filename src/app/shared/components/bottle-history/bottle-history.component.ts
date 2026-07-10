import { Component, computed, inject, input } from '@angular/core';

import { LogEntry } from '../../../models';
import { LogEntryService } from '../../../core/services/log-entry.service';
import { bottleHistory } from '../../utils/bottle-history';
import { deriveBottleStatus } from '../../utils/bottle-lifecycle';

/**
 * "Your history" roll-up (BB-194) for a bottle's detail page. Groups the user's
 * log entries for this catalog bottle from the already-loaded entries signal —
 * zero extra Firestore reads, no listener. Renders the aggregate plus the other
 * instances (a re-buy is its own instance) and a Buy Again shortcut.
 */
@Component({
  selector: 'app-bottle-history',
  templateUrl: './bottle-history.component.html',
  styleUrls: ['./bottle-history.component.scss'],
  standalone: false,
})
export class BottleHistoryComponent {
  private readonly log = inject(LogEntryService);

  readonly bourbonId = input.required<string>();
  readonly currentEntryId = input<string | null>(null);

  readonly history = computed(() =>
    bottleHistory(this.log.entries(), this.bourbonId())
  );

  /** Sibling instances — every log of this bottle except the one being viewed. */
  readonly others = computed(() =>
    this.history().instances.filter((e) => e.id !== this.currentEntryId())
  );
  readonly hasSiblings = computed(() => this.others().length > 0);

  /** Net price change from the first purchase to the latest, or null. */
  readonly priceDelta = computed(() => {
    const t = this.history().priceTrend;
    return t.length >= 2 ? t[t.length - 1].price - t[0].price : null;
  });

  statusLabel(e: LogEntry): string | null {
    const s = deriveBottleStatus(e);
    return s === 'finished' ? 'Killed' : s === 'open' ? 'Open' : null;
  }

  barrelLabel(e: LogEntry): string | null {
    return e.barrelLabel || (e.barrelNumber ? `Barrel ${e.barrelNumber}` : null);
  }
}
