import {
  ChangeDetectorRef,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  RefresherCustomEvent,
  ToastController,
  ViewWillEnter,
} from '@ionic/angular';

import { ArticleState, NewsArticle } from '../../models';
import { NewsService } from '../../core/services/news.service';
import { relativeTime } from '../../shared/utils/relative-time';
import { isWatched, passesPrefs } from '../../shared/utils/news-filter';

type Segment = 'feed' | 'read' | 'saved';

@Component({
  selector: 'app-dispatch',
  templateUrl: './dispatch.page.html',
  styleUrls: ['./dispatch.page.scss'],
  standalone: false,
})
export class DispatchPage implements ViewWillEnter {
  private readonly news = inject(NewsService);
  private readonly toast = inject(ToastController);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly loading = this.news.loading;
  readonly articles = this.news.articles;
  readonly segment = signal<Segment>('feed');

  readonly visible = computed<NewsArticle[]>(() => {
    const map = this.news.stateMap();
    const seg = this.segment();
    const prefs = this.news.effectivePrefs();
    return this.news.articles().filter((a) => {
      const st = a.id ? map.get(a.id) : undefined;
      if (seg === 'read') {
        return st === 'read';
      }
      if (seg === 'saved') {
        return st === 'saved';
      }
      // Active feed: only un-actioned articles (saved/read/dismissed move out),
      // and only those matching the user's prefs.
      return !st && passesPrefs(a, prefs);
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
  }

  relTime(a: NewsArticle): string {
    return relativeTime(a.publishedAt?.toDate() ?? null);
  }

  openArticle(a: NewsArticle): void {
    window.open(a.url, '_blank', 'noopener');
  }

  async doRefresh(event: RefresherCustomEvent): Promise<void> {
    try {
      await this.news.loadLatest();
    } finally {
      await event.target.complete();
    }
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
