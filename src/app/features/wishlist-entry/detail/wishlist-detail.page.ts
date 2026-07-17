import { Component, computed, inject } from '@angular/core';
import {
  takeUntilDestroyed,
  toObservable,
  toSignal,
} from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';
import { combineLatest, from, of } from 'rxjs';
import {
  distinctUntilChanged,
  map,
  shareReplay,
  switchMap,
} from 'rxjs/operators';

import { CriticSignal, Sighting, WishlistEntry } from '../../../models';
import { WishlistService } from '../../../core/services/wishlist.service';
import { SightingService } from '../../../core/services/sighting.service';
import { BourbonCatalogService } from '../../../core/services/bourbon-catalog.service';
import { CATEGORY_DISPLAY } from '../../../shared/constants/category-display';
import {
  PRIORITY_DISPLAY,
  STATUS_DISPLAY,
} from '../../../shared/constants/wishlist-display';
import {
  SightingFreshness,
  bestNonStalePrice,
  isSightingStale,
  sightingFreshness,
} from '../../../shared/utils/sighting';

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
  private readonly catalog = inject(BourbonCatalogService);
  private readonly router = inject(Router);
  private readonly alertCtrl = inject(AlertController);
  private readonly toast = inject(ToastController);

  readonly entryId =
    this.route.snapshot.paramMap.get('id') ??
    this.route.snapshot.parent?.paramMap.get('id') ??
    '';

  readonly entry = this.wishlist.selectById(this.entryId);

  // Sightings are keyed by the bottle (bourbonId), not the wishlist entry, so
  // the listener swaps once the entry (hence its bourbonId) has loaded.
  private readonly sightings$ = toObservable(this.entry).pipe(
    switchMap((e) =>
      e?.bourbonId
        ? this.sightingService.sightingsForBottle(e.bourbonId)
        : of<Sighting[]>([])
    ),
    // One shared listener feeds both the signal and the self-heal below.
    shareReplay({ bufferSize: 1, refCount: true })
  );
  private readonly sightings = toSignal(this.sightings$, {
    initialValue: [] as Sighting[],
  });

  // Critic signals (BB-221) for the app-critic-summary section: ONE getDoc when
  // the bottle changes (never a listener), fed from the already-loaded entry's
  // bourbonId — distinctUntilChanged keeps a wishlist edit from re-reading it.
  private readonly criticSignals$ = toObservable(this.entry).pipe(
    map((e) => e?.bourbonId ?? null),
    distinctUntilChanged(),
    switchMap((id) => (id ? from(this.catalog.getById(id)) : of(null))),
    map((b) => b?.criticSignals ?? null),
    shareReplay({ bufferSize: 1, refCount: true })
  );
  readonly criticSignals = toSignal(this.criticSignals$, {
    initialValue: null as Record<string, CriticSignal> | null,
  });

  constructor() {
    // Self-heal the cached best-sighting price (BB-161). The card on the Hunt
    // List reads this cached field; if it drifted (e.g. a sighting logged before
    // the recompute-race fix), reconcile it against the live sightings here —
    // the one place we already hold both the entry and its real sightings.
    combineLatest([toObservable(this.entry), this.sightings$])
      .pipe(takeUntilDestroyed())
      .subscribe(([entry, sightings]) =>
        this.reconcileBestPrice(entry, sightings)
      );
  }

  private reconcileBestPrice(
    entry: WishlistEntry | undefined,
    sightings: Sighting[]
  ): void {
    if (!entry?.id) {
      return;
    }
    const best = bestNonStalePrice(sightings);
    if (best === (entry.bestSightingPrice ?? null)) {
      return;
    }
    void this.wishlist.setBestSightingPrice(entry.id, best);
  }
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

  freshness(s: Sighting): SightingFreshness {
    return sightingFreshness(s);
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

  /**
   * Report a sighting for this bottle via the one shared Spotted It form —
   * same form as everywhere else, so detail-page sightings get the location
   * attach / on-site attestation features too. The bottle arrives prefilled;
   * returnTo brings the user back here after saving.
   */
  reportSighting(): void {
    const e = this.entry();
    if (!e?.bourbonId) {
      return;
    }
    void this.router.navigate(['/spotted/new'], {
      queryParams: {
        bourbonId: e.bourbonId,
        bourbonName: e.bourbonName,
        returnTo: `/wishlist/${this.entryId}`,
      },
    });
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
