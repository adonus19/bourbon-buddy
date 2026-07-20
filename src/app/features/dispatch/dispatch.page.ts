import {
  ChangeDetectorRef,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  InfiniteScrollCustomEvent,
  ModalController,
  RefresherCustomEvent,
  ToastController,
  ViewWillEnter,
} from '@ionic/angular';

import {
  ACTIVE_WISHLIST_STATUSES,
  ArticleState,
  MentionedBottle,
  NewsArticle,
} from '../../models';
import { NewsService } from '../../core/services/news.service';
import { LogEntryService } from '../../core/services/log-entry.service';
import { WishlistService } from '../../core/services/wishlist.service';
import { TasteMatchService } from '../../core/services/taste-match.service';
import { PerfTraceService } from '../../core/services/perf-trace.service';
import { OnboardingService } from '../../core/onboarding/onboarding.service';
import { TIPS } from '../../core/onboarding/tips.config';
import { BottlePreviewSheetComponent } from '../../shared/components/bottle-preview-sheet/bottle-preview-sheet.component';
import { relativeTime } from '../../shared/utils/relative-time';
import { isWatched, passesPrefs } from '../../shared/utils/news-filter';
import {
  RadarBottle,
  releaseRadar,
  withoutTracked,
} from '../../shared/utils/release-radar';
import {
  NEWS_SOURCE_NAMES,
  NEWS_WINDOWS,
  NewsWindow,
} from '../../shared/constants/news-sources';

type Segment = 'feed' | 'read' | 'saved' | 'radar';

@Component({
  selector: 'app-dispatch',
  templateUrl: './dispatch.page.html',
  styleUrls: ['./dispatch.page.scss'],
  standalone: false,
})
export class DispatchPage implements ViewWillEnter {
  private readonly news = inject(NewsService);
  private readonly log = inject(LogEntryService);
  private readonly wishlist = inject(WishlistService);
  private readonly tasteMatch = inject(TasteMatchService);
  private readonly modalCtrl = inject(ModalController);
  private readonly perf = inject(PerfTraceService);
  private readonly toast = inject(ToastController);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly onboarding = inject(OnboardingService);

  readonly loading = this.news.loading;
  readonly loadingMore = this.news.loadingMore;
  readonly error = this.news.error;
  readonly articles = this.news.articles;
  readonly hasMore = this.news.hasMore;
  readonly window = this.news.window;
  readonly source = this.news.source;
  readonly segment = signal<Segment>('feed');
  readonly search = signal('');

  readonly windows = NEWS_WINDOWS;
  readonly sources = NEWS_SOURCE_NAMES;

  readonly visible = computed<NewsArticle[]>(() => {
    const map = this.news.stateMap();
    const seg = this.segment();
    const prefs = this.news.effectivePrefs();
    const term = this.search().trim().toLowerCase();
    const matches = (a: NewsArticle): boolean =>
      !term ||
      a.headline.toLowerCase().includes(term) ||
      (a.sourceName?.toLowerCase().includes(term) ?? false) ||
      (a.excerpt?.toLowerCase().includes(term) ?? false);

    // Saved uses its own by-id pool so nothing is hidden by feed pagination.
    if (seg === 'saved') {
      return this.news
        .savedArticles()
        .filter((a) => (a.id ? map.get(a.id) === 'saved' : false) && matches(a));
    }
    return this.news.articles().filter((a) => {
      const st = a.id ? map.get(a.id) : undefined;
      if (seg === 'read') {
        return st === 'read' && matches(a);
      }
      // Active feed: un-actioned articles matching prefs.
      return !st && passesPrefs(a, prefs) && matches(a);
    });
  });

  /** First visible article with AI-extracted bottles — the tip's spotlight. */
  readonly firstAiArticleId = computed<string | null>(
    () => this.visible().find((a) => a.mentionedBottles?.length)?.id ?? null
  );

  /**
   * Release Radar (BB-207): bottles recently surfaced in the news, derived
   * client-side from the already-loaded articles' cached `mentionedBottles` —
   * no extra Firestore reads, no listener. Honest framing: "spotted in the
   * news," never "released."
   */
  readonly radarBottles = computed<RadarBottle[]>(() =>
    releaseRadar(this.news.articles())
  );

  /** "Hide ones I track" toggle (BB-209). */
  readonly hideTracked = signal(false);

  /** Catalog ids the user already tracks — their Cellar + active Hunt List. */
  private readonly trackedIds = computed<Set<string>>(() => {
    const ids = new Set(this.log.entries().map((e) => e.bourbonId));
    for (const e of this.wishlist.entries()) {
      if (ACTIVE_WISHLIST_STATUSES.includes(e.status)) {
        ids.add(e.bourbonId);
      }
    }
    return ids;
  });

  /** Radar after the optional "hide tracked" filter. */
  readonly visibleRadar = computed<RadarBottle[]>(() =>
    this.hideTracked()
      ? withoutTracked(this.radarBottles(), this.trackedIds())
      : this.radarBottles()
  );

  watched(a: NewsArticle): boolean {
    return isWatched(a, this.news.effectivePrefs());
  }

  ionViewWillEnter(): void {
    void this.news.ensureLoaded();
    this.cdr.detectChanges();
    // Point out AI-extracted bottles once, after the feed has had a moment to
    // render an article that actually has some. No-ops (unflagged) otherwise.
    setTimeout(() => void this.onboarding.showTipOnce(TIPS.aiFinds), 800);
  }

  setSegment(value: Segment): void {
    this.segment.set(value);
    if (value === 'saved') {
      void this.news.loadSaved();
    } else if (value === 'radar') {
      // Fire the first-run tip once the radar list has had a moment to render an
      // anchor; skipped (unmarked) when the radar is empty, so it retries later.
      setTimeout(() => void this.onboarding.showTipOnce(TIPS.releaseRadar), 800);
    }
  }

  onSearch(event: Event): void {
    this.search.set(
      (event as CustomEvent<{ value?: string }>).detail?.value ?? ''
    );
  }

  setWindow(value: NewsWindow): void {
    this.news.setWindow(value);
  }

  setSource(value: string | null): void {
    this.news.setSource(value || null);
  }

  async loadMore(event: InfiniteScrollCustomEvent): Promise<void> {
    try {
      await this.news.loadMore();
    } finally {
      await event.target.complete();
    }
  }

  relTime(a: NewsArticle): string {
    return relativeTime(a.publishedAt?.toDate() ?? null);
  }

  /**
   * Provenance label for the source classification (BB-220). Plain "news" (and
   * pre-v3 articles without a type) show nothing — the label exists to flag
   * marketing vs evaluation, not to decorate every row.
   */
  typeLabel(a: NewsArticle): string | null {
    switch (a.articleType) {
      case 'press_release':
        return 'Press release';
      case 'independent_review':
        return 'Review';
      case 'listicle':
        return 'Roundup';
      default:
        return null;
    }
  }

  openArticle(a: NewsArticle): void {
    window.open(a.url, '_blank', 'noopener');
    // Opening an unread article files it under Read; saved articles stay saved.
    if (a.id) {
      const st = this.news.stateMap().get(a.id);
      if (st !== 'saved' && st !== 'read') {
        void this.news.setState(a.id, 'read');
      }
    }
  }

  /** Taste Match badge on a chip (BB-199), from tags denormalized at extraction. */
  isTasteMatch(b: MentionedBottle): boolean {
    return this.tasteMatch.matches(b.flavor).matched;
  }

  /**
   * Opens the bottle preview sheet for an article chip (BB-198). Replaces the
   * old blind add-to-hunt-list tap (BB-130): the sheet shows the flavor
   * profile and similar bottles, with an explicit add button. Stops the tap
   * from opening the article.
   */
  async openBottle(b: MentionedBottle, ev: Event): Promise<void> {
    ev.stopPropagation();
    // BB-228a: same sheet as Radar, so trace this path too.
    this.perf.start('feed chip → preview sheet');
    const endPresent = this.perf.span('modal.create+present');
    const modal = await this.modalCtrl.create({
      component: BottlePreviewSheetComponent,
      componentProps: { bottle: b },
      breakpoints: [0, 0.65, 0.95],
      initialBreakpoint: 0.65,
      cssClass: 'glass-modal',
    });
    await modal.present();
    endPresent();
    void modal.onDidDismiss().then(() => this.perf.end());
  }

  async doRefresh(event: RefresherCustomEvent): Promise<void> {
    try {
      await this.news.loadLatest();
    } finally {
      await event.target.complete();
    }
  }

  async retry(): Promise<void> {
    await this.news.loadLatest();
  }

  async mark(a: NewsArticle, state: ArticleState): Promise<void> {
    if (!a.id) {
      return;
    }
    await this.news.setState(a.id, state);
    if (state === 'saved') {
      await this.presentToast('Saved for later.');
    } else if (state === 'dismissed') {
      await this.presentToast("Gone. Won't show it again.");
    }
  }

  async clear(a: NewsArticle): Promise<void> {
    if (a.id) {
      await this.news.clearState(a.id);
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
