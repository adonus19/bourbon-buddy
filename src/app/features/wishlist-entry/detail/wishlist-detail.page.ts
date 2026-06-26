import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, ModalController, ToastController } from '@ionic/angular';
import { Timestamp } from '@angular/fire/firestore';

import { Sighting } from '../../../models';
import { WishlistService } from '../../../core/services/wishlist.service';
import {
  SightingInput,
  SightingService,
} from '../../../core/services/sighting.service';
import { CATEGORY_DISPLAY } from '../../../shared/constants/category-display';
import {
  PRIORITY_DISPLAY,
  STATUS_DISPLAY,
} from '../../../shared/constants/wishlist-display';
import { isSightingStale } from '../../../shared/utils/sighting';
import { SightingFormComponent } from '../../../shared/components/sighting-form/sighting-form.component';

@Component({
  selector: 'app-wishlist-detail',
  templateUrl: './wishlist-detail.page.html',
  styleUrls: ['./wishlist-detail.page.scss'],
  standalone: false,
})
export class WishlistDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly wishlist = inject(WishlistService);
  private readonly sightingService = inject(SightingService);
  private readonly router = inject(Router);
  private readonly alertCtrl = inject(AlertController);
  private readonly modalCtrl = inject(ModalController);
  private readonly toast = inject(ToastController);

  readonly entryId =
    this.route.snapshot.paramMap.get('id') ??
    this.route.snapshot.parent?.paramMap.get('id') ??
    '';

  readonly entry = this.wishlist.selectById(this.entryId);

  // One sightings listener for the viewed entry.
  private readonly sightings = toSignal(
    this.sightingService.sightingsFor(this.entryId),
    { initialValue: [] as Sighting[] }
  );
  readonly sortedSightings = computed(() =>
    [...this.sightings()].sort(
      (a, b) =>
        a.price - b.price || b.sightingDate.toMillis() - a.sightingDate.toMillis()
    )
  );

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

  isStale(s: Sighting): boolean {
    return isSightingStale(s);
  }

  /** Per-sighting MSRP delta. */
  sightingDelta(s: Sighting): { text: string; below: boolean } | null {
    const e = this.entry();
    if (e?.msrp == null || e.msrp <= 0) {
      return null;
    }
    const pct = Math.round(((s.price - e.msrp) / e.msrp) * 100);
    return { text: `${pct >= 0 ? '+' : ''}${pct}%`, below: pct < 0 };
  }

  async openSightingForm(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: SightingFormComponent,
      breakpoints: [0, 0.9],
      initialBreakpoint: 0.9,
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role !== 'save' || !data) {
      return;
    }
    const input: SightingInput = {
      storeName: (data.storeName ?? '').trim(),
      price: Number(data.price),
      sightingDate: Timestamp.fromDate(new Date(data.sightingDate)),
      city: (data.city ?? '').trim() || null,
      state: (data.state ?? '').trim() || null,
      notes: (data.notes ?? '').trim() || null,
    };
    try {
      await this.sightingService.add(this.entryId, input);
      await this.presentToast('Sighting logged. People are going to believe you.');
    } catch {
      await this.presentToast("Couldn't save the sighting. Try again.");
    }
  }

  async toggleStale(s: Sighting): Promise<void> {
    if (!s.id) {
      return;
    }
    await this.sightingService.setStale(
      this.entryId,
      s.id,
      !s.markedStaleManually
    );
  }

  async removeSighting(s: Sighting): Promise<void> {
    if (!s.id) {
      return;
    }
    await this.sightingService.remove(this.entryId, s.id);
  }

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
