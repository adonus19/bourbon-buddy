import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController } from '@ionic/angular';

import { SharedItem, WishlistStatus } from '../../../models';
import { SharedItemsService } from '../../../core/services/shared-items.service';
import { WishlistService } from '../../../core/services/wishlist.service';
import { CATEGORY_DISPLAY } from '../../../shared/constants/category-display';
import { CellarIntent } from '../../../shared/utils/shared-receive';

/**
 * Receive a shared bottle (BB-230c). Reached by the `bottleShare` notification's
 * deep-link (`/shared/:id`). Shows who shared what (and their rating, if opted
 * in) and lets the recipient choose where it lands:
 *  - Cellar — Shelf / Journal / Graveyard, presented as intents that PRESET the
 *    log form (those views are derived from entryType + bottleStatus, not set).
 *  - Hunt List — Hunting / Got Away, which ARE real WishlistStatus values.
 * Acting marks the share `imported`; skipping marks it `dismissed`. What was
 * shared is the catalog bottle, so both sides key on the same `bourbonId`.
 */
@Component({
  selector: 'app-shared-item-receive',
  templateUrl: './shared-item-receive.page.html',
  styleUrls: ['./shared-item-receive.page.scss'],
  standalone: false,
})
export class SharedItemReceivePage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sharedItems = inject(SharedItemsService);
  private readonly wishlist = inject(WishlistService);
  private readonly toastCtrl = inject(ToastController);

  private readonly id = this.route.snapshot.paramMap.get('id') ?? '';

  readonly item = signal<SharedItem | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);

  async ngOnInit(): Promise<void> {
    try {
      this.item.set(await this.sharedItems.get(this.id));
    } catch {
      this.item.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  sharerLabel(): string {
    const it = this.item();
    if (!it) {
      return 'A friend';
    }
    return it.fromUsername ? `@${it.fromUsername}` : it.fromDisplayName || 'A friend';
  }

  categoryLabel(): string | null {
    const c = this.item()?.category;
    return c ? (CATEGORY_DISPLAY[c]?.label ?? null) : null;
  }

  /** Cellar intents preset the log form; navigating carries the share + intent. */
  async receiveToCellar(intent: CellarIntent): Promise<void> {
    if (!this.item() || this.busy()) {
      return;
    }
    this.busy.set(true);
    await this.sharedItems.markStatus(this.id, 'imported').catch(() => undefined);
    await this.router.navigate(['/entry/new'], {
      queryParams: { fromShared: this.id, intent },
    });
  }

  /** Hunt List intents add a wishlist entry directly (Hunting / Got Away). */
  async receiveToHuntList(status: WishlistStatus): Promise<void> {
    const it = this.item();
    if (!it || this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      await this.wishlist.add({
        bourbonId: it.bourbonId,
        bourbonName: it.bottleName,
        distillery: it.distillery ?? null,
        category: it.category ?? null,
        reviewLinks: [],
        priority: 'normal',
        status,
        discoverySource: 'Shared',
      });
      await this.sharedItems.markStatus(this.id, 'imported').catch(() => undefined);
      await this.presentToast(
        status === 'got_away'
          ? `Filed ${it.bottleName} under Got Away.`
          : `Added ${it.bottleName} to your hunt list.`
      );
      await this.router.navigateByUrl('/tabs/hunt-list');
    } catch {
      await this.presentToast("Couldn't add that bottle. Try again.");
      this.busy.set(false);
    }
  }

  async dismiss(): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    await this.sharedItems.markStatus(this.id, 'dismissed').catch(() => undefined);
    await this.router.navigateByUrl('/tabs/dispatch');
  }

  private async presentToast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 2200 });
    await toast.present();
  }
}
