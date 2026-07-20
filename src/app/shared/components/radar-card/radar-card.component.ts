import { Component, computed, inject, input, signal } from '@angular/core';
import { ModalController, ToastController } from '@ionic/angular';

import { ACTIVE_WISHLIST_STATUSES } from '../../../models';
import { BourbonCatalogService } from '../../../core/services/bourbon-catalog.service';
import { LogEntryService } from '../../../core/services/log-entry.service';
import { PerfTraceService } from '../../../core/services/perf-trace.service';
import { TasteMatchService } from '../../../core/services/taste-match.service';
import { WishlistService } from '../../../core/services/wishlist.service';
import { CATEGORY_DISPLAY } from '../../constants/category-display';
import { relativeTime } from '../../utils/relative-time';
import { RadarBottle } from '../../utils/release-radar';
import { BottlePreviewSheetComponent } from '../bottle-preview-sheet/bottle-preview-sheet.component';

/**
 * A Release Radar card (BB-208): one bottle recently surfaced in the news, with
 * a taste-match badge, Cellar/Hunt-List awareness, and two actions — add it to
 * the hunt list, or open the preview sheet. All annotations come from the
 * already-loaded state-holder signals (zero extra reads); the card carries the
 * derived `RadarBottle` from BB-207.
 */
@Component({
  selector: 'app-radar-card',
  templateUrl: './radar-card.component.html',
  styleUrls: ['./radar-card.component.scss'],
  standalone: false,
})
export class RadarCardComponent {
  private readonly wishlist = inject(WishlistService);
  private readonly log = inject(LogEntryService);
  private readonly catalog = inject(BourbonCatalogService);
  private readonly tasteMatch = inject(TasteMatchService);
  private readonly modalCtrl = inject(ModalController);
  private readonly toastCtrl = inject(ToastController);
  private readonly perf = inject(PerfTraceService);

  readonly radar = input.required<RadarBottle>();
  readonly adding = signal(false);

  readonly bottle = computed(() => this.radar().bottle);
  private readonly bourbonId = computed(() => this.radar().bottle.bourbonId ?? null);

  /** Taste Match badge (BB-199) from the flavor tags denormalized on the mention. */
  readonly isTasteMatch = computed(
    () => this.tasteMatch.matches(this.bottle().flavor).matched
  );

  /** bourbonIds the user has logged. */
  private readonly cellarIds = computed(
    () => new Set(this.log.entries().map((e) => e.bourbonId))
  );
  /** bourbonIds on the active hunt list. */
  private readonly huntIds = computed(
    () =>
      new Set(
        this.wishlist
          .entries()
          .filter((e) => ACTIVE_WISHLIST_STATUSES.includes(e.status))
          .map((e) => e.bourbonId)
      )
  );

  readonly inCellar = computed(() => {
    const id = this.bourbonId();
    return !!id && this.cellarIds().has(id);
  });
  readonly onHuntList = computed(() => {
    const id = this.bourbonId();
    return !!id && this.huntIds().has(id);
  });

  categoryLabel(): string | null {
    const c = this.bottle().category;
    return c ? (CATEGORY_DISPLAY[c]?.label ?? null) : null;
  }

  categoryAccent(): string {
    const c = this.bottle().category;
    return c
      ? (CATEGORY_DISPLAY[c]?.accentVar ?? 'var(--color-cat-other)')
      : 'var(--color-cat-other)';
  }

  /** Newest source that mentioned this bottle. */
  source(): string {
    return this.radar().articles[0]?.sourceName ?? '';
  }

  /** Relative time of the most recent mention. */
  when(): string {
    const newest = this.radar().articles[0];
    return relativeTime(
      newest?.publishedAt?.toDate() ?? newest?.fetchedAt?.toDate() ?? null
    );
  }

  /** Adds the bottle to the hunt list, creating the catalog entry if needed. */
  async addToHuntList(): Promise<void> {
    if (this.adding() || this.onHuntList()) {
      return;
    }
    const b = this.bottle();
    this.adding.set(true);
    try {
      const bourbonId =
        b.bourbonId ||
        (await this.catalog.findOrCreate({
          name: b.name,
          distillery: b.distillery ?? null,
          bottler: null,
          category: b.category ?? null,
          subType: null,
          ageStatement: null,
          isNas: false,
          proof: null,
          series: null,
        }));
      await this.wishlist.add({
        bourbonId,
        bourbonName: b.name,
        distillery: b.distillery ?? null,
        category: b.category ?? null,
        reviewLinks: [],
        priority: 'normal',
        status: 'actively_looking',
        discoverySource: 'Release Radar',
      });
      await this.presentToast(`Added ${b.name} to your hunt list.`);
    } catch {
      await this.presentToast("Couldn't add that bottle. Try again.");
    } finally {
      this.adding.set(false);
    }
  }

  /** Opens the shared preview sheet (flavor profile, price, similar bottles). */
  async view(): Promise<void> {
    // BB-228a: one trace spans the whole open, closed on dismiss so the child
    // components' reads (similar-bottles, price-history) land in it too.
    this.perf.start('radar → preview sheet');
    const endPresent = this.perf.span('modal.create+present');
    const modal = await this.modalCtrl.create({
      component: BottlePreviewSheetComponent,
      componentProps: { bottle: this.bottle() },
      breakpoints: [0, 0.65, 0.95],
      initialBreakpoint: 0.65,
      cssClass: 'glass-modal',
    });
    await modal.present();
    endPresent();
    void modal.onDidDismiss().then(() => this.perf.end());
  }

  private async presentToast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 2200 });
    await toast.present();
  }
}
