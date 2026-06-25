import { Component, computed, inject, signal } from '@angular/core';
import { ActionSheetController } from '@ionic/angular';

import { LogEntry } from '../../models';
import { LogEntryService } from '../../core/services/log-entry.service';

type SortKey = 'date' | 'rating' | 'name' | 'distillery' | 'proof';

const SORT_LABELS: Record<SortKey, string> = {
  date: 'date added',
  rating: 'rating',
  name: 'name',
  distillery: 'distillery',
  proof: 'proof',
};

@Component({
  selector: 'app-cellar',
  templateUrl: './cellar.page.html',
  styleUrls: ['./cellar.page.scss'],
  standalone: false,
})
export class CellarPage {
  private readonly logService = inject(LogEntryService);
  private readonly actionSheet = inject(ActionSheetController);

  readonly entries = this.logService.entries;
  readonly sort = signal<SortKey>('date');
  readonly sortLabel = computed(() => SORT_LABELS[this.sort()]);

  readonly sortedEntries = computed<LogEntry[]>(() => {
    const list = [...this.entries()];
    switch (this.sort()) {
      case 'rating':
        return list.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
      case 'name':
        return list.sort((a, b) => a.bourbonName.localeCompare(b.bourbonName));
      case 'distillery':
        return list.sort((a, b) =>
          (a.distillery ?? '').localeCompare(b.distillery ?? '')
        );
      case 'proof':
        return list.sort((a, b) => (b.proof ?? -1) - (a.proof ?? -1));
      case 'date':
      default:
        return list.sort(
          (a, b) => b.entryDate.toMillis() - a.entryDate.toMillis()
        );
    }
  });

  async openSort(): Promise<void> {
    const sheet = await this.actionSheet.create({
      header: 'Sort by',
      buttons: [
        { text: 'Date added', handler: () => this.sort.set('date') },
        { text: 'Rating (high–low)', handler: () => this.sort.set('rating') },
        { text: 'Name (A–Z)', handler: () => this.sort.set('name') },
        { text: 'Distillery', handler: () => this.sort.set('distillery') },
        { text: 'Proof (high–low)', handler: () => this.sort.set('proof') },
        { text: 'Cancel', role: 'cancel' },
      ],
    });
    await sheet.present();
  }
}
