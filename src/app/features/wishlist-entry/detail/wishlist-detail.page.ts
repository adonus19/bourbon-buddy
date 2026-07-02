import { Component, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, ModalController, ToastController } from '@ionic/angular';
import { Timestamp } from '@angular/fire/firestore';
import { of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

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
import { sightingErrorMessage } from '../../../shared/utils/sighting-error';
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

  // Sightings are keyed by the bottle (bourbonId), not the wishlist entry, so
  // the listener swaps once the entry (hence its bourbonId) has loaded.
  private readonly sightings = toSignal(
    toObservable(this.entry).pipe(
      switchMap((e) =>
        e?.bourbonId
          ? this.sightingService.sightingsForBottle(e.bourbonId)
          : of<Sighting[]>([])
      )
    ),
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
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role !== 'save' || !data) {
      return;
    }
    const e = this.entry();
    if (!e?.bourbonId) {
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
      await this.sightingService.add(
        e.bourbonId,
        e.bourbonName,
        input,
        data.visibility === 'friends' ? 'friends' : 'private'
      );
      await this.presentToast('Sighting logged. People are going to believe you.');
    } catch (err) {
      await this.presentToast(sightingErrorMessage(err));
    }
  }

  async toggleStale(s: Sighting): Promise<void> {
    const bourbonId = this.entry()?.bourbonId;
    if (!s.id || !bourbonId) {
      return;
    }
    await this.sightingService.setStale(s.id, bourbonId, !s.markedStaleManually);
  }

  async removeSighting(s: Sighting): Promise<void> {
    const bourbonId = this.entry()?.bourbonId;
    if (!s.id || !bourbonId) {
      return;
    }
    await this.sightingService.remove(s.id, bourbonId);
  }

  /** Pre-fills the Add-Log form from this entry and archives it on save. */
  foundItLogIt(): void {
    void this.router.navigate(['/entry/new'], {
      queryParams: { fromWishlist: this.entryId },
    });
  }

  /** Didn't get it — move to the "Got Away" archive (no Cellar entry). */
  async markGotAway(): Promise<void> {
    try {
      await this.wishlist.setStatus(this.entryId, 'got_away');
      await this.presentToast('Moved to the ones that got away.');
    } catch {
      await this.presentToast("Couldn't update. Try again.");
    }
  }

  /** Bring a "Got Away" bottle back into active hunting. */
  async backToHunting(): Promise<void> {
    try {
      await this.wishlist.setStatus(this.entryId, 'actively_looking');
      await this.presentToast('Back on the hunt.');
    } catch {
      await this.presentToast("Couldn't update. Try again.");
    }
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
