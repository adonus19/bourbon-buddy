import { Component, computed, inject, signal } from '@angular/core';

import { LogEntryService } from '../../core/services/log-entry.service';
import { CATEGORY_DISPLAY } from '../../shared/constants/category-display';
import {
  buildYearReview,
  yearsWithData,
} from '../../shared/utils/year-review';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Year in Review (BB-200) — "Whiskey Wrapped". Pure derivation of the loaded
 * entries signal: no reads, no storage, nothing precomputed. In-app page only
 * by design (shareable image cards are a parked backlog item).
 */
@Component({
  selector: 'app-year-review',
  templateUrl: './year-review.page.html',
  styleUrls: ['./year-review.page.scss'],
  standalone: false,
})
export class YearReviewPage {
  private readonly log = inject(LogEntryService);

  readonly years = computed(() => yearsWithData(this.log.entries()));

  private readonly pickedYear = signal<number | null>(null);

  /** Selected year, defaulting to the newest one with data. */
  readonly year = computed(() => this.pickedYear() ?? this.years()[0] ?? null);

  readonly review = computed(() => {
    const year = this.year();
    return year === null ? null : buildYearReview(this.log.entries(), year);
  });

  readonly topCategoryLabel = computed(() => {
    const top = this.review()?.topCategory;
    return top ? CATEGORY_DISPLAY[top.category]?.label ?? null : null;
  });

  readonly topCategoryAccent = computed(() => {
    const top = this.review()?.topCategory;
    return top
      ? CATEGORY_DISPLAY[top.category]?.accentVar ?? 'var(--color-cat-other)'
      : 'var(--color-cat-other)';
  });

  readonly busiestMonthName = computed(() => {
    const m = this.review()?.busiestMonth;
    return m ? MONTHS[m.month] : null;
  });

  pickYear(year: number): void {
    this.pickedYear.set(year);
  }
}
