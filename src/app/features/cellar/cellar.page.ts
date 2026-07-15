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
  ToastController,
  ViewWillEnter,
} from '@ionic/angular';

import { LogEntry } from '../../models';
import { LogEntryService } from '../../core/services/log-entry.service';
import { InboxService } from '../../core/services/inbox.service';
import {
  CellarView,
  matchesCellarView,
} from '../../shared/utils/bottle-lifecycle';
import {
  EMPTY_LOG_FILTER,
  LogFilter,
  activeChips,
  isFilterActive,
  matchesFilter,
  matchesSearch,
} from './log-filter';
import { EntryGroup, groupEntriesByPeriod } from './entry-groups';
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
  private readonly toast = inject(ToastController);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly inbox = inject(InboxService);

  /** Unread inbox count for the header bell; refreshed on entering this tab. */
  readonly inboxUnread = signal(0);

  readonly entries = this.logService.entries;
  readonly loaded = this.logService.loaded;
  readonly sort = signal<SortKey>('date');
  readonly sortLabel = computed(() => SORT_LABELS[this.sort()]);

  readonly search = signal('');
  readonly filter = signal<LogFilter>(EMPTY_LOG_FILTER);
  readonly filterActive = computed(() => isFilterActive(this.filter()));
  readonly chips = computed(() => activeChips(this.filter()));

  /** Which Cellar segment is showing. Shelf (what you own, open) is the default. */
  readonly view = signal<CellarView>('shelf');

  /** True when a search term or filter is narrowing the list. */
  readonly hasQuery = computed(
    () => this.search().trim().length > 0 || this.filterActive()
  );

  /** Segment + search + filter applied on top of the current sort. */
  readonly visibleEntries = computed<LogEntry[]>(() => {
    const term = this.search();
    const f = this.filter();
    const v = this.view();
    return this.sortedEntries().filter(
      (e) =>
        matchesCellarView(e, v) && matchesSearch(e, term) && matchesFilter(e, f)
    );
  });

  /**
   * Per-group expand/collapse overrides, keyed by EntryGroup.key. Absent key →
   * default state (newest group open, the rest collapsed). Cleared on segment
   * change so each tab starts from the default.
   */
  private readonly groupToggles = signal<ReadonlyMap<string, boolean>>(
    new Map()
  );

  /**
   * Journal/Graveyard collapse into time-period sections (BB-171-style pure
   * derivation — nothing stored). Only when sorted by date with no search or
   * filter narrowing the list: under a name/rating sort month sections are
   * meaningless, and collapsed groups would hide search hits. Null → render
   * the flat list.
   */
  readonly sections = computed<(EntryGroup & { open: boolean })[] | null>(
    () => {
      const view = this.view();
      if (view === 'shelf' || this.sort() !== 'date' || this.hasQuery()) {
        return null;
      }
      const groups = groupEntriesByPeriod(this.visibleEntries(), view);
      const toggles = this.groupToggles();
      return groups.map((g, i) => ({
        ...g,
        open: toggles.get(g.key) ?? i === 0,
      }));
    }
  );

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
    // Refresh the notification badge on focus (no always-on listener).
    void this.inbox.unreadCount().then((n) => this.inboxUnread.set(n));
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

  setView(value: CellarView): void {
    this.view.set(value);
    this.groupToggles.set(new Map());
  }

  toggleGroup(key: string, open: boolean): void {
    this.groupToggles.update((m) => new Map(m).set(key, !open));
  }

  /** Swipe action: kill a bottle straight from the Shelf, with an Undo toast. */
  async killFromList(e: LogEntry): Promise<void> {
    if (!e.id) {
      return;
    }
    const id = e.id;
    const prevPct = e.bottleRemainingPct ?? null;
    try {
      await this.logService.killBottle(id);
      const t = await this.toast.create({
        message: `${e.bourbonName} killed. 🪦`,
        duration: 3500,
        position: 'bottom',
        buttons: [
          {
            text: 'Undo',
            handler: () => {
              void this.logService.reopenBottle(id, prevPct);
            },
          },
        ],
      });
      await t.present();
    } catch {
      const t = await this.toast.create({
        message: "Couldn't update. Try again.",
        duration: 2000,
        position: 'bottom',
      });
      await t.present();
    }
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
