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
  ArticleState,
  MentionedBottle,
  NewsArticle,
} from '../../models';
import { NewsService } from '../../core/services/news.service';
import { TasteMatchService } from '../../core/services/taste-match.service';
import { BottlePreviewSheetComponent } from '../../shared/components/bottle-preview-sheet/bottle-preview-sheet.component';
import { relativeTime } from '../../shared/utils/relative-time';
import { isWatched, passesPrefs } from '../../shared/utils/news-filter';
import {
  NEWS_SOURCE_NAMES,
  NEWS_WINDOWS,
  NewsWindow,
} from '../../shared/constants/news-sources';

type Segment = 'feed' | 'read' | 'saved';

@Component({
  selector: 'app-dispatch',
  templateUrl: './dispatch.page.html',
  styleUrls: ['./dispatch.page.scss'],
  standalone: false,
})
export class DispatchPage implements ViewWillEnter {
  private readonly news = inject(NewsService);
  private readonly tasteMatch = inject(TasteMatchService);
  private readonly modalCtrl = inject(ModalController);
  private readonly toast = inject(ToastController);
  private readonly cdr = inject(ChangeDetectorRef);

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

  watched(a: NewsArticle): boolean {
    return isWatched(a, this.news.effectivePrefs());
  }

  ionViewWillEnter(): void {
    void this.news.ensureLoaded();
    this.cdr.detectChanges();
  }

  setSegment(value: Segment): void {
    this.segment.set(value);
    if (value === 'saved') {
      void this.news.loadSaved();
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
    const modal = await this.modalCtrl.create({
      component: BottlePreviewSheetComponent,
      componentProps: { bottle: b },
      breakpoints: [0, 0.65, 0.95],
      initialBreakpoint: 0.65,
      cssClass: 'glass-modal',
    });
    await modal.present();
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
