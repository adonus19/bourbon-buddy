import { Component, inject } from '@angular/core';

import { StoreNote, StorePriceTier, StoreSpecialty } from '../../../models';
import { StoreNotesService } from '../../../core/services/store-notes.service';

const TIER_LABEL: Record<StorePriceTier, string> = {
  underpriced: 'Underpriced',
  fair: 'Fair',
  overpriced: 'Overpriced',
};

const SPECIALTY_LABEL: Record<StoreSpecialty, string> = {
  'store-picks': 'Store Picks',
  allocated: 'Allocated',
  'barrel-picks': 'Barrel Picks',
  'rare-finds': 'Rare Finds',
};

/**
 * My Stores list (BB-223): the private retailer notebook. Reads the shared
 * `stores()` signal from StoreNotesService — no listener of its own. Rows open
 * the store detail page (BB-224), which carries the edit entry point.
 */
@Component({
  selector: 'app-stores-list',
  templateUrl: './stores-list.page.html',
  styleUrls: ['./stores-list.page.scss'],
  standalone: false,
})
export class StoresListPage {
  private readonly storeNotes = inject(StoreNotesService);

  readonly stores = this.storeNotes.stores;
  readonly loaded = this.storeNotes.loaded;

  location(s: StoreNote): string | null {
    return [s.city, s.state].filter(Boolean).join(', ') || null;
  }

  tierLabel(s: StoreNote): string | null {
    return s.priceTier ? TIER_LABEL[s.priceTier] : null;
  }

  specialtyLabels(s: StoreNote): string[] {
    return (s.specialties ?? []).map((v) => SPECIALTY_LABEL[v] ?? v);
  }
}
