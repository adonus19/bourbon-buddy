import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';

import { WishlistService } from '../../../core/services/wishlist.service';
import {
  CATEGORY_DISPLAY,
} from '../../../shared/constants/category-display';
import {
  PRIORITY_DISPLAY,
  STATUS_DISPLAY,
} from '../../../shared/constants/wishlist-display';

@Component({
  selector: 'app-wishlist-detail',
  templateUrl: './wishlist-detail.page.html',
  styleUrls: ['./wishlist-detail.page.scss'],
  standalone: false,
})
export class WishlistDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly wishlist = inject(WishlistService);
  private readonly router = inject(Router);
  private readonly alertCtrl = inject(AlertController);
  private readonly toast = inject(ToastController);

  readonly entryId =
    this.route.snapshot.paramMap.get('id') ??
    this.route.snapshot.parent?.paramMap.get('id') ??
    '';

  readonly entry = this.wishlist.selectById(this.entryId);

  readonly priority = computed(() => {
    const e = this.entry();
    return e ? PRIORITY_DISPLAY[e.priority] : null;
  });
  readonly statusLabel = computed(() => {
    const e = this.entry();
    return e ? STATUS_DISPLAY[e.status] ?? '' : '';
  });
  readonly categoryLabel = computed(() => {
    const e = this.entry();
    return e?.category ? CATEGORY_DISPLAY[e.category]?.label ?? '' : '';
  });
  readonly delta = computed(() => {
    const e = this.entry();
    if (e?.msrp == null || e.msrp <= 0 || e.bestSightingPrice == null) {
      return null;
    }
    const pct = Math.round(((e.bestSightingPrice - e.msrp) / e.msrp) * 100);
    return { text: `${pct >= 0 ? '+' : ''}${pct}%`, below: pct < 0 };
  });

  /** Navigation-only for now; the full prefill + archive flow lands in Iteration 4. */
  foundItLogIt(): void {
    void this.router.navigateByUrl('/entry/new');
  }

  async confirmDelete(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Remove from Hunt List?',
      message: this.entry()?.bourbonName,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Remove',
          role: 'destructive',
          handler: () => {
            void this.doDelete();
          },
        },
      ],
    });
    await alert.present();
  }

  private async doDelete(): Promise<void> {
    try {
      await this.wishlist.remove(this.entryId);
      await this.presentToast('Removed.');
      await this.router.navigateByUrl('/tabs/hunt-list', { replaceUrl: true });
    } catch {
      await this.presentToast("Couldn't remove. Try again.");
    }
  }

  private async presentToast(message: string): Promise<void> {
    const t = await this.toast.create({
      message,
      duration: 2000,
      position: 'top',
    });
    await t.present();
  }
}
