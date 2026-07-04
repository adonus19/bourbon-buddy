import {
  ChangeDetectorRef,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  InfiniteScrollCustomEvent,
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
import { WishlistService } from '../../core/services/wishlist.service';
import { BourbonCatalogService } from '../../core/services/bourbon-catalog.service';
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
  private readonly wishlist = inject(WishlistService);
  private readonly catalog = inject(BourbonCatalogService);
  private readonly toast = inject(ToastController);
  private readonly cdr = inject(ChangeDetectorRef);

  private addingBottle = false;

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

  /**
   * Adds an AI-found bottle to the Hunt List from an article chip (BB-130).
   * Stops the tap from opening the article. Resolves the catalog id (creating
   * the entry only if the AI didn't already match one), skips duplicates.
   */
  async addBottle(b: MentionedBottle, ev: Event): Promise<void> {
    ev.stopPropagation();
    if (this.addingBottle) {
      return;
    }
    this.addingBottle = true;
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

      const already = this.wishlist
        .entries()
        .some(
          (e) =>
            e.bourbonId === bourbonId &&
            ACTIVE_WISHLIST_STATUSES.includes(e.status)
        );
      if (already) {
        await this.presentToast(`${b.name} is already on your hunt list.`);
        return;
      }

      await this.wishlist.add({
        bourbonId,
        bourbonName: b.name,
        distillery: b.distillery ?? null,
        category: b.category ?? null,
        reviewLinks: [],
        priority: 'normal',
        status: 'actively_looking',
        discoverySource: 'Dispatch',
      });
      await this.presentToast(`Added ${b.name} to your hunt list.`);
    } catch {
      await this.presentToast("Couldn't add that bottle. Try again.");
    } finally {
      this.addingBottle = false;
    }
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
