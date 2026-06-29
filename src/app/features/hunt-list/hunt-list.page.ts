import {
  ChangeDetectorRef,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  ActionSheetController,
  AlertController,
  ModalController,
  ViewWillEnter,
} from '@ionic/angular';

import {
  ACTIVE_WISHLIST_STATUSES,
  WishlistEntry,
  WISHLIST_PRIORITY_ORDER,
} from '../../models';
import { WishlistService } from '../../core/services/wishlist.service';
import {
  EMPTY_WISHLIST_FILTER,
  WishlistFilter,
  isWishlistFilterActive,
  matchesWishlistFilter,
  wishlistChips,
} from './wishlist-filter';
import { WishlistFilterModalComponent } from './filter-modal/wishlist-filter-modal.component';

type WishlistSort = 'priority' | 'name' | 'msrp' | 'best';

const SORT_LABELS: Record<WishlistSort, string> = {
  priority: 'priority',
  name: 'name',
  msrp: 'MSRP',
  best: 'best price',
};

@Component({
  selector: 'app-hunt-list',
  templateUrl: './hunt-list.page.html',
  styleUrls: ['./hunt-list.page.scss'],
  standalone: false,
})
export class HuntListPage implements ViewWillEnter {
  private readonly wishlist = inject(WishlistService);
  private readonly actionSheet = inject(ActionSheetController);
  private readonly alertCtrl = inject(AlertController);
  private readonly modalCtrl = inject(ModalController);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly entries = this.wishlist.entries;
  readonly loaded = this.wishlist.loaded;
  readonly archived = signal(false);
  readonly sort = signal<WishlistSort>('priority');
  readonly sortLabel = computed(() => SORT_LABELS[this.sort()]);
  readonly filter = signal<WishlistFilter>(EMPTY_WISHLIST_FILTER);
  readonly filterActive = computed(() => isWishlistFilterActive(this.filter()));
  readonly chips = computed(() => wishlistChips(this.filter()));

  readonly activeCount = computed(
    () =>
      this.entries().filter((e) => ACTIVE_WISHLIST_STATUSES.includes(e.status))
        .length
  );
  readonly archivedCount = computed(
    () => this.entries().filter((e) => e.status === 'got_away').length
  );

  readonly visibleEntries = computed<WishlistEntry[]>(() => {
    const showArchived = this.archived();
    const f = this.filter();
    const list = this.entries().filter((e) => {
      // Active = still hunting. Archive = "Got Away". Logged bottles live in the
      // Cellar and are intentionally hidden from the Hunt List entirely.
      const inView = showArchived
        ? e.status === 'got_away'
        : ACTIVE_WISHLIST_STATUSES.includes(e.status);
      return inView && matchesWishlistFilter(e, f);
    });
    return this.sortList(list);
  });

  private sortList(list: WishlistEntry[]): WishlistEntry[] {
    const sorted = [...list];
    switch (this.sort()) {
      case 'name':
        return sorted.sort((a, b) => a.bourbonName.localeCompare(b.bourbonName));
      case 'msrp':
        return sorted.sort((a, b) => (a.msrp ?? Infinity) - (b.msrp ?? Infinity));
      case 'best':
        return sorted.sort(
          (a, b) =>
            (a.bestSightingPrice ?? Infinity) - (b.bestSightingPrice ?? Infinity)
        );
      case 'priority':
      default:
        return sorted.sort((a, b) => {
          const pa = WISHLIST_PRIORITY_ORDER[a.priority];
          const pb = WISHLIST_PRIORITY_ORDER[b.priority];
          return pa !== pb
            ? pa - pb
            : a.bourbonName.localeCompare(b.bourbonName);
        });
    }
  }

  ionViewWillEnter(): void {
    // Same cached-tab refresh as the Cellar — re-check on return.
    this.cdr.detectChanges();
  }

  setArchived(value: boolean): void {
    this.archived.set(value);
  }

  /** Archive a bottle you didn't get to the "Got Away" list. */
  async markGotAway(e: WishlistEntry): Promise<void> {
    if (e.id) {
      await this.wishlist.setStatus(e.id, 'got_away');
    }
  }

  /** Move a "Got Away" bottle back into active hunting. */
  async restore(e: WishlistEntry): Promise<void> {
    if (e.id) {
      await this.wishlist.setStatus(e.id, 'actively_looking');
    }
  }

  async confirmDelete(e: WishlistEntry): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Delete this bottle?',
      message: e.bourbonName,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: () => {
            if (e.id) {
              void this.wishlist.remove(e.id);
            }
          },
        },
      ],
    });
    await alert.present();
  }

  applyFilter(next: WishlistFilter): void {
    this.filter.set(next);
  }

  async openFilter(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: WishlistFilterModalComponent,
      componentProps: { filter: this.filter() },
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<WishlistFilter>();
    if (role === 'apply' && data) {
      this.filter.set(data);
    }
  }

  async openSort(): Promise<void> {
    const sheet = await this.actionSheet.create({
      header: 'Sort by',
      buttons: [
        { text: 'Priority', handler: () => this.sort.set('priority') },
        { text: 'Name (A–Z)', handler: () => this.sort.set('name') },
        { text: 'MSRP (low–high)', handler: () => this.sort.set('msrp') },
        { text: 'Best price (low–high)', handler: () => this.sort.set('best') },
        { text: 'Cancel', role: 'cancel' },
      ],
    });
    await sheet.present();
  }
}
