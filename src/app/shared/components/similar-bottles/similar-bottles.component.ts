import {
  Component,
  Input,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ToastController } from '@ionic/angular';

import {
  ACTIVE_WISHLIST_STATUSES,
  SimilarBottle,
} from '../../../models';
import { BourbonCatalogService } from '../../../core/services/bourbon-catalog.service';
import { LogEntryService } from '../../../core/services/log-entry.service';
import { PerfTraceService } from '../../../core/services/perf-trace.service';
import { WishlistService } from '../../../core/services/wishlist.service';
import { CATEGORY_DISPLAY } from '../../constants/category-display';

/**
 * "Similar bottles" section (BB-197) for detail pages. Reads the precomputed
 * `similarBottles` cached on the catalog doc — ONE getDoc per view, no
 * listener, no model calls — and renders nothing at all when the bottle has
 * no qualifying neighbors. Cellar/hunt-list awareness comes from the already
 * loaded state-holder signals, so the badges cost zero extra reads.
 */
@Component({
  selector: 'app-similar-bottles',
  templateUrl: './similar-bottles.component.html',
  styleUrls: ['./similar-bottles.component.scss'],
  standalone: false,
})
export class SimilarBottlesComponent {
  private readonly catalog = inject(BourbonCatalogService);
  private readonly wishlist = inject(WishlistService);
  private readonly log = inject(LogEntryService);
  private readonly toastCtrl = inject(ToastController);
  private readonly perf = inject(PerfTraceService);

  readonly neighbors = signal<SimilarBottle[]>([]);
  private adding = false;

  // Fetch on id change via a plain setter — an explicit read path, never an
  // effect() (Firebase call discipline).
  @Input({ required: true })
  set bourbonId(id: string | null | undefined) {
    this.neighbors.set([]);
    if (id) {
      void this.load(id);
    }
  }

  /** bourbonIds the user has logged — shown as taste confirmation, not hidden. */
  readonly cellarIds = computed(
    () => new Set(this.log.entries().map((e) => e.bourbonId))
  );

  /** bourbonIds on the active hunt list — checkmark instead of the add CTA. */
  readonly huntIds = computed(
    () =>
      new Set(
        this.wishlist
          .entries()
          .filter((e) => ACTIVE_WISHLIST_STATUSES.includes(e.status))
          .map((e) => e.bourbonId)
      )
  );

  categoryLabel(b: SimilarBottle): string | null {
    return b.category ? (CATEGORY_DISPLAY[b.category]?.label ?? null) : null;
  }

  categoryAccent(b: SimilarBottle): string {
    return b.category
      ? (CATEGORY_DISPLAY[b.category]?.accentVar ?? 'var(--color-cat-other)')
      : 'var(--color-cat-other)';
  }

  async add(b: SimilarBottle): Promise<void> {
    if (this.adding || this.huntIds().has(b.bourbonId)) {
      return;
    }
    this.adding = true;
    try {
      await this.wishlist.add({
        bourbonId: b.bourbonId,
        bourbonName: b.name,
        distillery: null,
        category: b.category,
        reviewLinks: [],
        priority: 'normal',
        status: 'actively_looking',
        discoverySource: 'Similar bottles',
      });
      await this.presentToast(`Added ${b.name} to your hunt list.`);
    } catch {
      await this.presentToast("Couldn't add that bottle. Try again.");
    } finally {
      this.adding = false;
    }
  }

  private async load(id: string): Promise<void> {
    try {
      // BB-228a: duplicate of the sheet's own getById for the same doc.
      const bottle = await this.perf.measure(
        'similar-bottles.catalog.getById',
        () => this.catalog.getById(id)
      );
      this.neighbors.set(bottle?.similarBottles ?? []);
    } catch {
      this.neighbors.set([]); // best-effort section; missing is just hidden
    }
  }

  private async presentToast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 2200 });
    await toast.present();
  }
}
