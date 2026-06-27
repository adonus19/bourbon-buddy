import { Injectable, computed, inject } from '@angular/core';

import { LogEntryService } from './log-entry.service';
import {
  categoryBreakdown,
  computeSummary,
  ratingDistribution,
  topDistilleries,
  topFlavorTags,
} from '../../shared/utils/stats';

/**
 * Derived statistics over the signed-in user's log. Everything here is a
 * `computed` over the already-loaded `LogEntryService.entries` signal — NO
 * Firestore reads happen here, so recomputation on data changes is free.
 */
@Injectable({ providedIn: 'root' })
export class StatsService {
  private readonly log = inject(LogEntryService);

  readonly hasData = computed(() => this.log.entries().length > 0);

  readonly summary = computed(() => computeSummary(this.log.entries()));
  readonly ratingDistribution = computed(() =>
    ratingDistribution(this.log.entries())
  );
  readonly categoryBreakdown = computed(() =>
    categoryBreakdown(this.log.entries())
  );
  readonly topDistilleries = computed(() => topDistilleries(this.log.entries()));
  readonly topFlavorTags = computed(() => topFlavorTags(this.log.entries()));
}
