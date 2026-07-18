import { Component, Input, computed, inject, signal } from '@angular/core';
import { ModalController, ToastController } from '@ionic/angular';

import {
  ACTIVE_WISHLIST_STATUSES,
  Bourbon,
  BourbonCategory,
} from '../../../models';
import { BourbonCatalogService } from '../../../core/services/bourbon-catalog.service';
import { TasteMatchService } from '../../../core/services/taste-match.service';
import { WishlistService } from '../../../core/services/wishlist.service';
import { CATEGORY_DISPLAY } from '../../constants/category-display';
import {
  blendedProfileTags,
  consensusCount,
  marketingOnlyTags,
  orderTagsByWeight,
  profileSourceLabel,
} from '../../utils/flavor-provenance';

/**
 * Minimal bottle identity the preview sheet needs. Both a Dispatch
 * `MentionedBottle` and a mapped catalog `Bourbon` satisfy it, so any surface
 * with a bottle in hand can open the sheet (BB-217).
 */
export interface BottlePreviewInput {
  name: string;
  bourbonId?: string | null;
  distillery?: string | null;
  category?: BourbonCategory | null;
}

/**
 * Bottle preview sheet (BB-198): tapping a "Bottles mentioned" chip in the
 * Dispatch feed — or a Hunt List lookup result (BB-217) — opens this modal
 * instead of blind-adding to the hunt list: you see the bottle's flavor
 * profile and its similar bottles, then choose. One catalog getDoc per open;
 * the similar-bottles child reuses the same precomputed data (BB-197).
 */
@Component({
  selector: 'app-bottle-preview-sheet',
  templateUrl: './bottle-preview-sheet.component.html',
  styleUrls: ['./bottle-preview-sheet.component.scss'],
  standalone: false,
})
export class BottlePreviewSheetComponent {
  private readonly catalog = inject(BourbonCatalogService);
  private readonly wishlist = inject(WishlistService);
  private readonly tasteMatch = inject(TasteMatchService);
  private readonly modalCtrl = inject(ModalController);
  private readonly toastCtrl = inject(ToastController);

  @Input({ required: true }) bottle!: BottlePreviewInput;

  readonly catalogBottle = signal<Bourbon | null>(null);
  readonly loaded = signal(false);
  readonly adding = signal(false);

  /** Already on the active hunt list → show state instead of the add CTA. */
  readonly onHuntList = computed(() => {
    const id = this.bottle?.bourbonId ?? this.catalogBottle()?.id;
    return (
      !!id &&
      this.wishlist
        .entries()
        .some(
          (e) =>
            e.bourbonId === id && ACTIVE_WISHLIST_STATUSES.includes(e.status)
        )
    );
  });

  readonly profile = computed(() => this.catalogBottle()?.flavorProfile ?? null);

  /** Arrays with the BB-188 community tier blended in (community-first). */
  readonly blendedTags = computed(() => blendedProfileTags(this.profile()));

  /** Taste Match badge (BB-199): shared taste tags, strongest first. Matches
   * against the community-blended tags (BB-188) so tasters' notes count too. */
  readonly taste = computed(() => this.tasteMatch.matches(this.blendedTags()));

  /** Provenance line (BB-222): "Based on N reviews" vs "AI-suggested". */
  readonly sourceLabel = computed(() => profileSourceLabel(this.profile()));

  /** Producer claims no review corroborates — shown apart, never as consensus. */
  readonly claims = computed(() => marketingOnlyTags(this.profile()).slice(0, 6));

  /**
   * One stage's tags as display text, consensus-weighted (BB-222): ordered by
   * review mentions (+ half-weight corroborating claims), with an ×N marker
   * once two or more reviews agree — e.g. "Banana ×3 · Corn · Oak".
   */
  stageDisplay(stage: 'nose' | 'palate' | 'finish'): string {
    const p = this.profile();
    const tags = this.blendedTags()[stage];
    return orderTagsByWeight(tags, p)
      .map((tag) => {
        // Tasters-first consensus (BB-188): a drinker-confirmed tag badges its
        // taster count; otherwise the review count. Below 2 → no badge.
        const n = consensusCount(p, tag);
        return n >= 2 ? `${tag} ×${n}` : tag;
      })
      .join(' · ');
  }

  ionViewWillEnter(): void {
    void this.load();
  }

  categoryLabel(): string | null {
    const category = this.bottle?.category ?? this.catalogBottle()?.category;
    return category ? (CATEGORY_DISPLAY[category]?.label ?? null) : null;
  }

  categoryAccent(): string {
    const category = this.bottle?.category ?? this.catalogBottle()?.category;
    return category
      ? (CATEGORY_DISPLAY[category]?.accentVar ?? 'var(--color-cat-other)')
      : 'var(--color-cat-other)';
  }

  async addToHuntList(): Promise<void> {
    if (this.adding() || this.onHuntList()) {
      return;
    }
    this.adding.set(true);
    try {
      const bourbonId =
        this.bottle.bourbonId ||
        (await this.catalog.findOrCreate({
          name: this.bottle.name,
          distillery: this.bottle.distillery ?? null,
          bottler: null,
          category: this.bottle.category ?? null,
          subType: null,
          ageStatement: null,
          isNas: false,
          proof: null,
          series: null,
        }));
      await this.wishlist.add({
        bourbonId,
        bourbonName: this.bottle.name,
        distillery: this.bottle.distillery ?? null,
        category: this.bottle.category ?? null,
        reviewLinks: [],
        priority: 'normal',
        status: 'actively_looking',
        discoverySource: 'Dispatch',
      });
      await this.presentToast(`Added ${this.bottle.name} to your hunt list.`);
      await this.modalCtrl.dismiss(null, 'added');
    } catch {
      await this.presentToast("Couldn't add that bottle. Try again.");
    } finally {
      this.adding.set(false);
    }
  }

  async close(): Promise<void> {
    await this.modalCtrl.dismiss(null, 'cancel');
  }

  private async load(): Promise<void> {
    try {
      if (this.bottle?.bourbonId) {
        this.catalogBottle.set(await this.catalog.getById(this.bottle.bourbonId));
      }
    } catch {
      this.catalogBottle.set(null); // sheet still shows the basic chip info
    } finally {
      this.loaded.set(true);
    }
  }

  private async presentToast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 2200 });
    await toast.present();
  }
}
