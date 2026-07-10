import { Component, computed, input } from '@angular/core';

import { LogEntry } from '../../../models';
import {
  CATEGORY_DISPLAY,
  ENTRY_TYPE_LABELS,
} from '../../constants/category-display';
import {
  deriveBottleStatus,
  timeToKillDays,
} from '../../utils/bottle-lifecycle';

/**
 * The log-entry list card (Cellar). Presentational only — the parent supplies
 * the entry and wires navigation (e.g. routerLink) on the host element.
 */
@Component({
  selector: 'app-log-entry-card',
  templateUrl: './log-entry-card.component.html',
  styleUrls: ['./log-entry-card.component.scss'],
  standalone: false,
})
export class LogEntryCardComponent {
  readonly entry = input.required<LogEntry>();

  readonly accent = computed(
    () => CATEGORY_DISPLAY[this.entry().category]?.accentVar ?? 'var(--color-cat-other)'
  );
  readonly categoryLabel = computed(
    () => CATEGORY_DISPLAY[this.entry().category]?.label ?? '—'
  );
  readonly entryTypeLabel = computed(
    () => ENTRY_TYPE_LABELS[this.entry().entryType] ?? ''
  );
  readonly entryDate = computed(() => this.entry().entryDate?.toDate() ?? null);
  readonly lastPouredAt = computed(
    () => this.entry().lastPouredAt?.toDate() ?? null
  );

  /** Lifecycle status of an owned bottle; null for non-owned entries. */
  readonly bottleStatus = computed(() => deriveBottleStatus(this.entry()));
  readonly isKilled = computed(() => this.bottleStatus() === 'finished');

  /** Fill % for the meter — only for an open owned bottle with a known level. */
  readonly fillPct = computed(() => {
    if (this.bottleStatus() !== 'open') {
      return null;
    }
    return this.entry().bottleRemainingPct ?? null;
  });

  readonly timeToKill = computed(() => timeToKillDays(this.entry()));
}
