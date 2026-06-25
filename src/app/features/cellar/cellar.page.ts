import {
  ChangeDetectorRef,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  ActionSheetController,
  ModalController,
  ViewWillEnter,
} from '@ionic/angular';

import { LogEntry } from '../../models';
import { LogEntryService } from '../../core/services/log-entry.service';
import {
  EMPTY_LOG_FILTER,
  LogFilter,
  activeChips,
  isFilterActive,
  matchesFilter,
  matchesSearch,
} from './log-filter';
import { LogFilterModalComponent } from './filter-modal/log-filter-modal.component';

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
export class CellarPage implements ViewWillEnter {
  private readonly logService = inject(LogEntryService);
  private readonly actionSheet = inject(ActionSheetController);
  private readonly modalCtrl = inject(ModalController);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly entries = this.logService.entries;
  readonly sort = signal<SortKey>('date');
  readonly sortLabel = computed(() => SORT_LABELS[this.sort()]);

  readonly search = signal('');
  readonly filter = signal<LogFilter>(EMPTY_LOG_FILTER);
  readonly filterActive = computed(() => isFilterActive(this.filter()));
  readonly chips = computed(() => activeChips(this.filter()));

  /** Search + filter applied on top of the current sort. */
  readonly visibleEntries = computed<LogEntry[]>(() => {
    const term = this.search();
    const f = this.filter();
    return this.sortedEntries().filter(
      (e) => matchesSearch(e, term) && matchesFilter(e, f)
    );
  });

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

  ionViewWillEnter(): void {
    // Ionic caches this tab page and detaches its change detector while you're
    // on the add/detail screens. The entries() signal already reflects anything
    // added meanwhile, so force a re-check to render it on return.
    this.cdr.detectChanges();
  }

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

  onSearchInput(value: string): void {
    this.search.set(value);
  }

  applyFilter(next: LogFilter): void {
    this.filter.set(next);
  }

  async openFilter(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: LogFilterModalComponent,
      componentProps: { filter: this.filter() },
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<LogFilter>();
    if (role === 'apply' && data) {
      this.filter.set(data);
    }
  }
}
