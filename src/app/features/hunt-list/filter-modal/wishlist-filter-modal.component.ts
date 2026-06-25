import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { ModalController } from '@ionic/angular';

import { BourbonCategory, WishlistPriority } from '../../../models';
import { EMPTY_WISHLIST_FILTER, WishlistFilter } from '../wishlist-filter';

@Component({
  selector: 'app-wishlist-filter-modal',
  templateUrl: './wishlist-filter-modal.component.html',
  styleUrls: ['./wishlist-filter-modal.component.scss'],
  standalone: false,
})
export class WishlistFilterModalComponent implements OnInit {
  private readonly modalCtrl = inject(ModalController);

  @Input() filter: WishlistFilter = EMPTY_WISHLIST_FILTER;

  readonly draft = signal<WishlistFilter>(EMPTY_WISHLIST_FILTER);

  readonly priorities: { value: WishlistPriority; label: string }[] = [
    { value: 'grail', label: 'Unicorn' },
    { value: 'high', label: 'High' },
    { value: 'normal', label: 'Normal' },
    { value: 'low', label: 'Low' },
  ];

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

  ngOnInit(): void {
    this.draft.set({
      ...this.filter,
      priorities: [...this.filter.priorities],
      categories: [...this.filter.categories],
    });
  }

  isPrioritySelected(p: WishlistPriority): boolean {
    return this.draft().priorities.includes(p);
  }
  togglePriority(p: WishlistPriority): void {
    this.draft.update((d) => ({
      ...d,
      priorities: d.priorities.includes(p)
        ? d.priorities.filter((x) => x !== p)
        : [...d.priorities, p],
    }));
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

  setPriceMin(value: string): void {
    const n = Number(value);
    this.draft.update((d) => ({
      ...d,
      priceMin: value !== '' && Number.isFinite(n) ? n : null,
    }));
  }
  setPriceMax(value: string): void {
    const n = Number(value);
    this.draft.update((d) => ({
      ...d,
      priceMax: value !== '' && Number.isFinite(n) ? n : null,
    }));
  }

  clearAll(): void {
    this.draft.set({
      ...EMPTY_WISHLIST_FILTER,
      priorities: [],
      categories: [],
    });
  }

  apply(): void {
    void this.modalCtrl.dismiss(this.draft(), 'apply');
  }
  cancel(): void {
    void this.modalCtrl.dismiss(null, 'cancel');
  }
}
