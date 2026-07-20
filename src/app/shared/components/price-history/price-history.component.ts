import { Component, OnInit, computed, inject, input, signal } from '@angular/core';

import { PriceHistoryPoint } from '../../../models';
import { AuthService } from '../../../core/auth/auth.service';
import { FriendService } from '../../../core/services/friend.service';
import { LogEntryService } from '../../../core/services/log-entry.service';
import { PerfTraceService } from '../../../core/services/perf-trace.service';
import { PriceHistoryService } from '../../../core/services/price-history.service';
import { PricePoint, bottleHistory } from '../../utils/bottle-history';
import { pointsWithinDays, priceStats } from '../../utils/price-history';

/** A provenance row for the timeline (newest-first). */
interface PriceRow {
  id: string;
  price: number;
  date: Date;
  mine: boolean;
  place: string | null; // store name, else "City, ST", else null
  fresh: boolean; // observed within FRESH_DAYS
}

/**
 * Price History (BB-204) for a bottle's detail page. Plots the durable
 * `/priceHistory` timeline (own + friends-shared, via `PriceHistoryService`)
 * with honest per-point provenance, a summary stat row, an MSRP delta, and a
 * "spotted recently" callout.
 *
 * Cost discipline: a one-shot pull in `ngOnInit` (never a listener); the reads
 * live in an explicit method, never a `computed()`/`effect()`. All display
 * derivations below are pure `computed()`s over the loaded `points` signal.
 *
 * Sparse by nature (often 1–3 points), so the timeline leads with numbers and a
 * chronological list — the same honest treatment `bottle-history` uses — and only
 * shows the mini-bar sparkline once there are enough points to mean something.
 */
@Component({
  selector: 'app-price-history',
  templateUrl: './price-history.component.html',
  styleUrls: ['./price-history.component.scss'],
  standalone: false,
})
export class PriceHistoryComponent implements OnInit {
  private readonly priceHistory = inject(PriceHistoryService);
  private readonly friends = inject(FriendService);
  private readonly auth = inject(AuthService);
  private readonly log = inject(LogEntryService);
  private readonly perf = inject(PerfTraceService);

  readonly bourbonId = input.required<string>();
  readonly msrp = input<number | null>(null);
  /**
   * Compact mode (BB-206): a one-line crowd-price readout + mini sparkline for
   * embedding in the bottle preview sheet. Read-only, no provenance list, no
   * "Your purchases", and — crucially — no empty state: with no crowd prices it
   * renders nothing rather than cluttering the sheet.
   */
  readonly compact = input(false);

  /** Points within this many days count as "fresh" (still likely on the shelf). */
  private static readonly FRESH_DAYS = 15;
  /** Below this many points a sparkline is noise, not signal. */
  private static readonly SPARK_MIN = 4;

  readonly loading = signal(true);
  readonly points = signal<PriceHistoryPoint[]>([]);
  private readonly myUid = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    this.myUid.set(this.auth.snapshotUser?.uid ?? null);
    try {
      // BB-228a: these two are chained today — friendsOnce must resolve before
      // the points query starts. The spans' start offsets make that visible.
      const friends = await this.perf.measure('price.friendsOnce', () =>
        this.friends.friendsOnce()
      );
      const points = await this.perf.measure('price.pointsForBottle', () =>
        this.priceHistory.priceHistoryForBottle(
          this.bourbonId(),
          friends.map((f) => f.uid)
        )
      );
      this.points.set(points);
    } catch {
      this.points.set([]); // best-effort: a failed read shows the empty state
    } finally {
      this.loading.set(false);
    }
  }

  /** Crowd/market prices (durable sightings) exist for this bottle. */
  readonly hasCrowd = computed(() => this.points().length > 0);

  /**
   * The viewer's own purchase-price trend (BB-205) for this bottle, oldest →
   * newest, derived from the already-loaded `LogEntryService.entries` signal —
   * zero extra reads. A separate, permanent stream from crowd sightings; the two
   * never blend into one averaged number.
   */
  readonly purchaseTrend = computed<PricePoint[]>(
    () => bottleHistory(this.log.entries(), this.bourbonId()).priceTrend
  );
  readonly hasPurchases = computed(() => this.purchaseTrend().length > 0);

  /** Net change from first to latest purchase, or null with < 2 purchases. */
  readonly purchaseDelta = computed<number | null>(() => {
    const t = this.purchaseTrend();
    return t.length >= 2 ? t[t.length - 1].price - t[0].price : null;
  });

  /** Anything to show — crowd prices or the viewer's own purchases. */
  readonly hasData = computed(() => this.hasCrowd() || this.hasPurchases());

  readonly stats = computed(() => priceStats(this.points()));

  /** Newest-first provenance rows. */
  readonly rows = computed<PriceRow[]>(() => {
    const uid = this.myUid();
    const now = Date.now();
    return [...this.points()]
      .sort((a, b) => b.sightingDate.toMillis() - a.sightingDate.toMillis())
      .map((p) => {
        const ms = p.sightingDate.toMillis();
        const ageDays = (now - ms) / (24 * 60 * 60 * 1000);
        return {
          id: p.id ?? '',
          price: p.price,
          date: new Date(ms),
          mine: !!uid && p.spotterUid === uid,
          place: this.placeLabel(p),
          fresh: ageDays <= PriceHistoryComponent.FRESH_DAYS,
        };
      });
  });

  /** Lowest price among fresh (≤ FRESH_DAYS) points — the best current shelf price. */
  readonly recentBest = computed<number | null>(() => {
    const fresh = pointsWithinDays(this.points(), PriceHistoryComponent.FRESH_DAYS);
    return fresh.length ? Math.min(...fresh.map((p) => p.price)) : null;
  });

  /** Earliest observation, for a truthful "since {month}" span (2+ points). */
  readonly spanSince = computed<Date | null>(() => {
    const pts = this.points();
    if (pts.length < 2) {
      return null;
    }
    return new Date(Math.min(...pts.map((p) => p.sightingDate.toMillis())));
  });

  /** Median vs MSRP as a signed percentage, or null when MSRP is unknown. */
  readonly msrpDelta = computed<number | null>(() => {
    const m = this.msrp();
    const s = this.stats();
    if (!m || m <= 0 || !s) {
      return null;
    }
    return Math.round(((s.median - m) / m) * 100);
  });

  /** Single-series sparkline: bar height % per point, oldest→newest; [] when sparse. */
  readonly bars = computed<number[]>(() => {
    const prices = [...this.points()]
      .sort((a, b) => a.sightingDate.toMillis() - b.sightingDate.toMillis())
      .map((p) => p.price);
    if (prices.length < PriceHistoryComponent.SPARK_MIN) {
      return [];
    }
    const min = Math.min(...prices);
    const span = Math.max(...prices) - min || 1;
    // Floor at 8% so the cheapest point is still a visible mark.
    return prices.map((p) => Math.max(8, Math.round(((p - min) / span) * 100)));
  });

  private placeLabel(p: PriceHistoryPoint): string | null {
    if (p.storeName) {
      return p.storeName;
    }
    const cityState = [p.city, p.state].filter(Boolean).join(', ');
    return cityState || null;
  }
}
