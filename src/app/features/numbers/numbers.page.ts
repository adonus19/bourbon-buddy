import {
  ChangeDetectorRef,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { ViewDidEnter } from '@ionic/angular';
import { ChartConfiguration } from 'chart.js';

import { ModalController } from '@ionic/angular';

import { StatsService } from '../../core/services/stats.service';
import { LogEntryService } from '../../core/services/log-entry.service';
import { NewsService } from '../../core/services/news.service';
import { AuthService } from '../../core/auth/auth.service';
import { UserService } from '../../core/services/user.service';
import { OnboardingService } from '../../core/onboarding/onboarding.service';
import { TIPS } from '../../core/onboarding/tips.config';
import { cssVarValue } from '../../shared/utils/css-var';
import {
  displaySpend,
  isSpendHidden,
  spendPrivacyOf,
} from '../../shared/utils/spend-privacy';
import { GauntletSources } from '../../shared/utils/gauntlet';
import { releaseRadar } from '../../shared/utils/release-radar';
import { SpendGauntletComponent } from '../../shared/components/spend-gauntlet/spend-gauntlet.component';
import {
  ActivityRange,
  MonthActivity,
  PREFERENCE_MIN_POINTS,
  PreferenceCurve,
  activityByMonth,
} from '../../shared/utils/stats';

@Component({
  selector: 'app-numbers',
  templateUrl: './numbers.page.html',
  styleUrls: ['./numbers.page.scss'],
  standalone: false,
})
export class NumbersPage implements ViewDidEnter {
  private readonly stats = inject(StatsService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly onboarding = inject(OnboardingService);
  private readonly auth = inject(AuthService);
  private readonly users = inject(UserService);
  private readonly log = inject(LogEntryService);
  private readonly news = inject(NewsService);
  private readonly modalCtrl = inject(ModalController);

  /**
   * Discreet Total Spent (BB-229). Derived from the profile listener
   * AuthService already holds — no extra read, no listener of our own.
   */
  readonly spendPrivacy = computed(() => spendPrivacyOf(this.auth.profile()));
  /** Transient: a reveal lasts for this visit only, never flipping `hidden`. */
  readonly revealedThisSession = signal(false);
  readonly spendHidden = computed(() =>
    isSpendHidden(this.spendPrivacy(), this.revealedThisSession())
  );

  readonly hasData = this.stats.hasData;
  readonly summary = this.stats.summary;
  readonly topDistilleries = this.stats.topDistilleries;
  readonly topFlavorTags = this.stats.topFlavorTags;
  readonly tastePreference = this.stats.tastePreference;

  /**
   * Charts are only created after the page-enter transition completes, so the
   * canvas measures its final container size and animates from the baseline
   * instead of scaling up from a mid-transition size (mobile zoom artifact).
   */
  readonly chartsReady = signal(false);

  readonly minPoints = PREFERENCE_MIN_POINTS;
  readonly proofCurve = this.stats.proofPreference;
  readonly ageCurve = this.stats.agePreference;

  readonly range = signal<ActivityRange>('12m');
  readonly activity = computed(() =>
    activityByMonth(this.stats.entries(), this.range())
  );
  readonly selectedMonth = signal<MonthActivity | null>(null);

  /** Highest single flavor-tag count, for sizing the bar fills. */
  readonly maxFlavorCount = computed(() =>
    Math.max(1, ...this.topFlavorTags().map((t) => t.count))
  );

  readonly ratingChartData = computed<ChartConfiguration<'bar'>['data']>(() => {
    const bins = this.stats.ratingDistribution();
    return {
      labels: bins.map((b) => b.label),
      datasets: [
        {
          data: bins.map((b) => b.count),
          backgroundColor: cssVarValue('--color-amber'),
          hoverBackgroundColor: cssVarValue('--color-amber-light'),
          borderRadius: 4,
          maxBarThickness: 26,
        },
      ],
    };
  });

  readonly ratingChartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: cssVarValue('--color-text-secondary'), font: { size: 11 } },
      },
      y: {
        beginAtZero: true,
        ticks: {
          color: cssVarValue('--color-text-secondary'),
          precision: 0,
          font: { size: 11 },
        },
        grid: { color: cssVarValue('--color-border') },
      },
    },
  };

  readonly categoryChartData = computed<ChartConfiguration<'doughnut'>['data']>(
    () => {
      const slices = this.stats.categoryBreakdown();
      return {
        labels: slices.map((s) => s.label),
        datasets: [
          {
            data: slices.map((s) => s.count),
            backgroundColor: slices.map((s) => cssVarValue(s.accentVar)),
            borderColor: cssVarValue('--color-bg-surface'),
            borderWidth: 2,
          },
        ],
      };
    }
  );

  readonly categoryChartOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '60%',
    plugins: {
      legend: {
        position: 'right',
        labels: {
          color: cssVarValue('--color-text-secondary'),
          boxWidth: 12,
          font: { size: 12 },
          padding: 10,
        },
      },
    },
  };

  // --- Preference curves (proof & age) ---

  private curveData(curve: PreferenceCurve): ChartConfiguration<'line'>['data'] {
    return {
      labels: curve.buckets.map((b) => b.label),
      datasets: [
        {
          data: curve.buckets.map((b) =>
            b.avg == null ? null : Math.round(b.avg * 100) / 100
          ),
          borderColor: cssVarValue('--color-amber'),
          backgroundColor: cssVarValue('--color-amber-dim'),
          pointBackgroundColor: cssVarValue('--color-amber-light'),
          pointRadius: 4,
          tension: 0.35,
          spanGaps: true,
          fill: false,
        },
      ],
    };
  }

  readonly proofChartData = computed(() => this.curveData(this.proofCurve()));
  readonly ageChartData = computed(() => this.curveData(this.ageCurve()));

  readonly preferenceChartOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: cssVarValue('--color-text-secondary'), font: { size: 11 } },
      },
      y: {
        min: 0,
        max: 5,
        ticks: {
          color: cssVarValue('--color-text-secondary'),
          stepSize: 1,
          font: { size: 11 },
        },
        grid: { color: cssVarValue('--color-border') },
      },
    },
  };

  // --- Activity over time ---

  readonly activityChartData = computed<ChartConfiguration<'bar'>['data']>(() => {
    const months = this.activity();
    return {
      labels: months.map((m) => m.label),
      datasets: [
        {
          data: months.map((m) => m.count),
          backgroundColor: cssVarValue('--color-amber'),
          hoverBackgroundColor: cssVarValue('--color-amber-light'),
          borderRadius: 4,
          maxBarThickness: 34,
        },
      ],
    };
  });

  readonly activityChartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: cssVarValue('--color-text-secondary'), font: { size: 10 } },
      },
      y: {
        beginAtZero: true,
        ticks: {
          color: cssVarValue('--color-text-secondary'),
          precision: 0,
          font: { size: 11 },
        },
        grid: { color: cssVarValue('--color-border') },
      },
    },
  };

  setRange(range: ActivityRange): void {
    this.range.set(range);
    this.selectedMonth.set(null);
  }

  onActivityClick(event: { active?: { index: number }[] }): void {
    const index = event.active?.[0]?.index;
    if (index == null) {
      return;
    }
    const month = this.activity()[index];
    this.selectedMonth.set(month && month.count > 0 ? month : null);
  }

  openEntry(id: string | undefined): void {
    if (id) {
      void this.router.navigateByUrl(`/entry/${id}`);
    }
  }

  ionViewDidEnter(): void {
    // Wait one frame past the enter transition so the canvas sizes correctly.
    requestAnimationFrame(() => {
      this.chartsReady.set(true);
      this.cdr.detectChanges();
    });
    // Point out the Year in Review, but only once there's data to celebrate;
    // on an empty account it stays unflagged and fires on a later visit.
    if (this.hasData()) {
      setTimeout(() => void this.onboarding.showTipOnce(TIPS.yearReview), 500);
    }
  }

  /** The real figure, before any masking. */
  private rawSpent(): string {
    return `$${Math.round(this.summary().totalSpent).toLocaleString()}`;
  }

  /** What the Total Spent tile renders — masked when hidden (BB-229). */
  spent(): string {
    return displaySpend(
      this.rawSpent(),
      this.spendPrivacy(),
      this.revealedThisSession()
    );
  }

  /** Eye icon reflects what tapping will do. */
  spendActionIcon(): string {
    return this.spendHidden() ? 'eye-outline' : 'eye-off-outline';
  }

  spendActionLabel(): string {
    return this.spendHidden() ? 'Show total spent' : 'Hide total spent';
  }

  /**
   * Corner-action tap. Hiding is immediate and persistent; revealing is
   * session-only so the amount re-hides on the next visit rather than quietly
   * undoing the user's setting.
   */
  async toggleSpendPrivacy(): Promise<void> {
    const uid = this.auth.snapshotUser?.uid;
    if (!uid) {
      return;
    }

    // Branch on what is CURRENTLY DISPLAYED, not on the stored flag — while a
    // session reveal is active the amount is visible even though `hidden` is
    // still true, and tapping then must re-hide rather than re-reveal.
    if (!this.spendHidden()) {
      this.revealedThisSession.set(false);
      if (!this.spendPrivacy().hidden) {
        await this.users.setSpendPrivacy(uid, { hidden: true });
      }
      return;
    }

    // Masked → reveal for this visit only. Turning the setting back OFF for
    // good lives in Settings (BB-229d), deliberately: the tile's own control
    // shouldn't be able to undo the choice as easily as it was made.
    if (this.spendPrivacy().mode === 'self') {
      await this.runGauntlet(uid);
      return;
    }
    // partner + plain reveal instantly — a partner mode that made you solve
    // puzzles while someone waits would be worse than not hiding at all.
    this.revealedThisSession.set(true);
  }

  /**
   * Self mode (BB-229c): all seven stages, every time. A cancel leaves the
   * amount masked and discards progress, so the next attempt starts over.
   */
  private async runGauntlet(uid: string): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: SpendGauntletComponent,
      componentProps: { sources: this.gauntletSources() },
      cssClass: 'glass-modal',
      backdropDismiss: false,
    });
    await modal.present();
    const { role } = await modal.onDidDismiss();
    if (role !== 'revealed') {
      return;
    }
    this.revealedThisSession.set(true);
    // Best-effort counter; failing to record a run must never block the reveal
    // the user just earned.
    void this.users
      .setSpendPrivacy(uid, {
        gauntletRuns: this.spendPrivacy().gauntletRuns + 1,
      })
      .catch(() => undefined);
  }

  /**
   * Puzzle material, richest source first — all from already-loaded signals,
   * so building a run costs zero reads.
   */
  private gauntletSources(): GauntletSources {
    const entries = this.log.entries();
    return {
      rated: entries
        .filter((e) => e.rating != null)
        .map((e) => ({ name: e.bourbonName, rating: e.rating as number })),
      priced: entries
        .filter((e) => e.purchasePrice != null)
        .map((e) => ({
          name: e.bourbonName,
          price: e.purchasePrice as number,
        })),
      radar: releaseRadar(this.news.articles()).map((r) => r.bottle.name),
    };
  }

  avg(): string {
    const a = this.summary().avgRating;
    return a == null ? '—' : `${a.toFixed(1)}★`;
  }
}
