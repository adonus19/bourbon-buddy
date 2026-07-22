import {
  ChangeDetectorRef,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  ActionSheetController,
  AlertController,
  ModalController,
  ViewWillEnter,
} from '@ionic/angular';

import {
  ACTIVE_WISHLIST_STATUSES,
  SharedItem,
  WishlistEntry,
  WISHLIST_PRIORITY_ORDER,
} from '../../models';
import { WishlistService } from '../../core/services/wishlist.service';
import { SharedItemsService } from '../../core/services/shared-items.service';
import { groupSharesBySharer } from '../../shared/utils/shared-groups';
import {
  EMPTY_WISHLIST_FILTER,
  WishlistFilter,
  isWishlistFilterActive,
  matchesWishlistFilter,
  wishlistChips,
} from './wishlist-filter';
import { WishlistFilterModalComponent } from './filter-modal/wishlist-filter-modal.component';
import { ShareListModalComponent } from '../../shared/components/share-list-modal/share-list-modal.component';
import { BottleLookupComponent } from './bottle-lookup/bottle-lookup.component';

type WishlistSort = 'priority' | 'name' | 'msrp' | 'best';

/** Which segment of the Hunt List is showing. */
type HuntView = 'active' | 'archived' | 'shared';

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
  private readonly sharedItems = inject(SharedItemsService);
  private readonly router = inject(Router);
  private readonly actionSheet = inject(ActionSheetController);
  private readonly alertCtrl = inject(AlertController);
  private readonly modalCtrl = inject(ModalController);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly entries = this.wishlist.entries;
  readonly loaded = this.wishlist.loaded;
  /** Segment state: Hunting / Got Away / Shared with me. `archived` derives from it. */
  readonly view = signal<HuntView>('active');
  readonly archived = computed(() => this.view() === 'archived');
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

  // "Shared with me" segment (BB-230e) — pending shares from the shared listener,
  // grouped by sharer (newest sharer first, its items newest-first).
  readonly sharedLoaded = this.sharedItems.receivedLoaded;
  private readonly received = this.sharedItems.received;
  readonly sharedCount = computed(() => this.received().length);
  readonly sharedGroups = computed(() => groupSharesBySharer(this.received()));

  // Collapsible groups: all but the top group collapsed by default. `null` means
  // the user hasn't touched them yet, so the default (top open) applies — derived
  // purely, no effect needed. A user toggle materializes the explicit set.
  private readonly expandedGroups = signal<Set<string> | null>(null);

  isGroupExpanded(uid: string): boolean {
    const set = this.expandedGroups();
    return set === null ? this.sharedGroups()[0]?.fromUid === uid : set.has(uid);
  }

  toggleGroup(uid: string): void {
    const next = new Set(this.expandedGroups() ?? this.defaultExpanded());
    if (next.has(uid)) {
      next.delete(uid);
    } else {
      next.add(uid);
    }
    this.expandedGroups.set(next);
  }

  private defaultExpanded(): Set<string> {
    const top = this.sharedGroups()[0]?.fromUid;
    return new Set(top ? [top] : []);
  }

  /** Open the receive chooser for a share — the "import into my list" path. */
  async openShare(item: SharedItem): Promise<void> {
    if (item.id) {
      await this.router.navigate(['/shared', item.id]);
    }
  }

  /** Discard a share. Keep-separate is the passive default (leave it here); this
   * is the explicit "no thanks" that removes it from the segment. */
  async dismissShare(item: SharedItem): Promise<void> {
    if (item.id) {
      await this.sharedItems.markStatus(item.id, 'dismissed');
    }
  }

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

  setView(value: HuntView): void {
    this.view.set(value);
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

  /** Look up any catalog bottle — the in-store tasting-notes check (BB-217). */
  async openLookup(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: BottleLookupComponent,
    });
    await modal.present();
  }

  /** Share the whole active hunt list with a friend (BB-230d). */
  async shareList(): Promise<void> {
    const count = this.activeCount();
    if (count === 0) {
      const alert = await this.alertCtrl.create({
        header: 'Nothing to share',
        message: 'Your hunt list is empty — add a bottle first.',
        buttons: ['OK'],
      });
      await alert.present();
      return;
    }
    const modal = await this.modalCtrl.create({
      component: ShareListModalComponent,
      componentProps: { bottleCount: count },
      breakpoints: [0, 0.9],
      initialBreakpoint: 0.9,
    });
    await modal.present();
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
