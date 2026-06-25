import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { ModalController } from '@ionic/angular';

import { BourbonCategory, EntryType } from '../../../models';
import {
  EMPTY_LOG_FILTER,
  LogFilter,
  PROOF_BOUNDS,
  RATING_BOUNDS,
} from '../log-filter';

interface RangeValue {
  lower: number;
  upper: number;
}

@Component({
  selector: 'app-log-filter-modal',
  templateUrl: './log-filter-modal.component.html',
  styleUrls: ['./log-filter-modal.component.scss'],
  standalone: false,
})
export class LogFilterModalComponent implements OnInit {
  private readonly modalCtrl = inject(ModalController);

  /** Current filter, passed in via componentProps. */
  @Input() filter: LogFilter = EMPTY_LOG_FILTER;

  readonly draft = signal<LogFilter>(EMPTY_LOG_FILTER);

  readonly ratingBounds = RATING_BOUNDS;
  readonly proofBounds = PROOF_BOUNDS;

  readonly categories: { value: BourbonCategory; label: string }[] = [
    { value: 'bourbon', label: 'Bourbon' },
    { value: 'rye', label: 'Rye' },
    { value: 'wheat_whiskey', label: 'Wheat' },
    { value: 'tennessee', label: 'Tennessee' },
    { value: 'american_other', label: 'Other American' },
    { value: 'scotch', label: 'Scotch' },
    { value: 'irish', label: 'Irish' },
    { value: 'japanese', label: 'Japanese' },
    { value: 'world_other', label: 'World Other' },
  ];

  readonly entryTypes: { value: EntryType; label: string }[] = [
    { value: 'drink', label: 'Drink' },
    { value: 'bottle_purchased', label: 'Bottle' },
    { value: 'gift_received', label: 'Gift' },
    { value: 'sample_split', label: 'Sample' },
    { value: 'virtual_tasting', label: 'Virtual' },
  ];

  readonly ratingRange = computed<RangeValue>(() => ({
    lower: this.draft().ratingMin ?? RATING_BOUNDS.min,
    upper: this.draft().ratingMax ?? RATING_BOUNDS.max,
  }));
  readonly proofRange = computed<RangeValue>(() => ({
    lower: this.draft().proofMin ?? PROOF_BOUNDS.min,
    upper: this.draft().proofMax ?? PROOF_BOUNDS.max,
  }));

  ngOnInit(): void {
    this.draft.set({
      ...this.filter,
      categories: [...this.filter.categories],
      entryTypes: [...this.filter.entryTypes],
      flavorTags: [...this.filter.flavorTags],
    });
  }

  isCategorySelected(c: BourbonCategory): boolean {
    return this.draft().categories.includes(c);
  }
  toggleCategory(c: BourbonCategory): void {
    this.draft.update((d) => ({
      ...d,
      categories: d.categories.includes(c)
        ? d.categories.filter((x) => x !== c)
        : [...d.categories, c],
    }));
  }

  isEntryTypeSelected(t: EntryType): boolean {
    return this.draft().entryTypes.includes(t);
  }
  toggleEntryType(t: EntryType): void {
    this.draft.update((d) => ({
      ...d,
      entryTypes: d.entryTypes.includes(t)
        ? d.entryTypes.filter((x) => x !== t)
        : [...d.entryTypes, t],
    }));
  }

  setFlavorTags(tags: string[]): void {
    this.draft.update((d) => ({ ...d, flavorTags: tags }));
  }

  onRatingChange(value: RangeValue): void {
    this.draft.update((d) => ({
      ...d,
      ratingMin: value.lower > RATING_BOUNDS.min ? value.lower : null,
      ratingMax: value.upper < RATING_BOUNDS.max ? value.upper : null,
    }));
  }

  onProofChange(value: RangeValue): void {
    this.draft.update((d) => ({
      ...d,
      proofMin: value.lower > PROOF_BOUNDS.min ? value.lower : null,
      proofMax: value.upper < PROOF_BOUNDS.max ? value.upper : null,
    }));
  }

  setDateFrom(value: string): void {
    this.draft.update((d) => ({ ...d, dateFrom: value || null }));
  }
  setDateTo(value: string): void {
    this.draft.update((d) => ({ ...d, dateTo: value || null }));
  }

  clearAll(): void {
    this.draft.set({
      ...EMPTY_LOG_FILTER,
      categories: [],
      entryTypes: [],
      flavorTags: [],
    });
  }

  apply(): void {
    void this.modalCtrl.dismiss(this.draft(), 'apply');
  }

  cancel(): void {
    void this.modalCtrl.dismiss(null, 'cancel');
  }
}
