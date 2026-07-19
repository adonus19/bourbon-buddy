import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import {
  PriceHistoryPoint,
  StoreNote,
  StorePriceTier,
  StoreSpecialty,
} from '../../../models';
import { BourbonCatalogService } from '../../../core/services/bourbon-catalog.service';
import { PriceHistoryService } from '../../../core/services/price-history.service';
import { StoreNotesService } from '../../../core/services/store-notes.service';
import { relativeTime } from '../../../shared/utils/relative-time';
import {
  MsrpLookup,
  bottlesToResolve,
  liveStorePoints,
  pctVsMsrp,
  storeEvidence,
} from '../../../shared/utils/store-evidence';

const TIER_LABEL: Record<StorePriceTier, string> = {
  underpriced: 'Underpriced',
  fair: 'Fair',
  overpriced: 'Overpriced',
};

const SPECIALTY_LABEL: Record<StoreSpecialty, string> = {
  'store-picks': 'Store Picks',
  allocated: 'Allocated Drops',
  'barrel-picks': 'Barrel Picks',
  'rare-finds': 'Rare Finds',
};

/** Bottles resolved from the catalog per view — caps the detail page's reads. */
const BOTTLE_RESOLVE_CAP = 25;

/** A live (≤30d) sighting row, with the bottle name resolved where we have it. */
export interface LiveSightingRow {
  id: string;
  bourbonId: string;
  bottleName: string;
  price: number;
  when: string;
  pctVsMsrp: number | null;
}

/**
 * Store detail (BB-224): the manual intel the user wrote down, with *evidence*
 * from their own `/priceHistory` beside it. The evidence never sets the price
 * tier — it's the receipts for a call the user already made (see
 * store-note.model.ts). The bottom section lists the sightings still live at
 * this store (≤30d), derived from the points we already read.
 *
 * The store note itself comes from the shared `stores()` signal (no listener of
 * its own); only the price points and bottle names are read here, one-shot on
 * open, because a detail page is a pull surface.
 */
@Component({
  selector: 'app-store-detail',
  templateUrl: './store-detail.page.html',
  styleUrls: ['./store-detail.page.scss'],
  standalone: false,
})
export class StoreDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly storeNotes = inject(StoreNotesService);
  private readonly priceHistory = inject(PriceHistoryService);
  private readonly catalog = inject(BourbonCatalogService);

  readonly storeId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly store = this.storeNotes.selectById(this.storeId);
  readonly storesLoaded = this.storeNotes.loaded;

  /** False until the evidence read resolves — drives the panel's skeleton. */
  readonly evidenceLoading = signal(true);
  private readonly points = signal<PriceHistoryPoint[]>([]);
  private readonly msrps = signal<MsrpLookup>({});
  private readonly names = signal<Record<string, string>>({});

  readonly evidence = computed(() => storeEvidence(this.points(), this.msrps()));

  readonly hasEvidence = computed(() => this.points().length > 0);

  readonly liveSightings = computed<LiveSightingRow[]>(() => {
    const names = this.names();
    const msrps = this.msrps();
    return liveStorePoints(this.points()).map((p) => ({
      id: p.id ?? `${p.bourbonId}-${p.sightingDate.toMillis()}`,
      bourbonId: p.bourbonId,
      bottleName: names[p.bourbonId] ?? 'Unknown bottle',
      price: p.price,
      when: relativeTime(p.sightingDate.toDate()),
      pctVsMsrp: pctVsMsrp(p.price, msrps[p.bourbonId]),
    }));
  });

  /**
   * The store note arrives asynchronously (cold deep-link: the `stores()`
   * listener hasn't emitted yet), so the evidence read waits for its name. The
   * `loadedFor` guard makes this fire ONCE per store — Firebase call discipline
   * forbids reads that re-run with their dependencies, and this one can't.
   */
  private loadedFor: string | null = null;

  constructor() {
    effect(() => {
      const name = this.store()?.name;
      if (name && this.loadedFor !== name) {
        this.loadedFor = name;
        void this.loadEvidence(name);
      }
    });
  }

  private async loadEvidence(name: string): Promise<void> {
    this.evidenceLoading.set(true);
    try {
      const points = await this.priceHistory.priceHistoryForStore(name);
      this.points.set(points);

      const ids = bottlesToResolve(points, BOTTLE_RESOLVE_CAP);
      const bottles = await Promise.all(
        ids.map((id) => this.catalog.getById(id).catch(() => null))
      );
      const msrps: Record<string, number | null> = {};
      const names: Record<string, string> = {};
      for (const b of bottles) {
        if (b?.id) {
          msrps[b.id] = b.msrp ?? null;
          names[b.id] = b.name;
        }
      }
      this.msrps.set(msrps);
      this.names.set(names);
    } catch {
      // Evidence is a bonus panel — a failed read must never break the intel.
      this.points.set([]);
    } finally {
      this.evidenceLoading.set(false);
    }
  }

  location(s: StoreNote): string | null {
    return [s.city, s.state].filter(Boolean).join(', ') || null;
  }

  tierLabel(s: StoreNote): string | null {
    return s.priceTier ? TIER_LABEL[s.priceTier] : null;
  }

  specialtyLabels(s: StoreNote): string[] {
    return (s.specialties ?? []).map((v) => SPECIALTY_LABEL[v] ?? v);
  }

  /** "12% over MSRP" / "5% under MSRP" / "at MSRP" — signed, never a bare number. */
  msrpPhrase(pct: number | null): string | null {
    if (pct === null) {
      return null;
    }
    const rounded = Math.round(pct);
    if (rounded === 0) {
      return 'at MSRP';
    }
    return rounded > 0
      ? `${rounded}% over MSRP`
      : `${Math.abs(rounded)}% under MSRP`;
  }

  lastSeenPhrase(): string | null {
    const seen = this.evidence().lastSeen;
    return seen ? relativeTime(seen) : null;
  }
}
