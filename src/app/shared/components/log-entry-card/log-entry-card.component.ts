import { Component, computed, input } from '@angular/core';

import { LogEntry } from '../../../models';
import {
  CATEGORY_DISPLAY,
  ENTRY_TYPE_LABELS,
} from '../../constants/category-display';

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
}
