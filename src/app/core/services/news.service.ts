import { Injectable, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  Firestore,
  collection,
  collectionData,
  deleteDoc,
  doc,
  docData,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from '@angular/fire/firestore';
import { Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import {
  ArticleState,
  ArticleStateDoc,
  NewsArticle,
  UserNewsPreferences,
} from '../../models';
import { AuthService } from '../auth/auth.service';
import { DEFAULT_NEWS_PREFS, NewsPrefs } from '../../shared/utils/news-filter';

// Kept modest for now; bump this once the feed list uses virtual scroll
// (ion-virtual-scroll / CDK) so we can render a longer backlog cheaply.
const FEED_LIMIT = 40;

/**
 * News feed reads. Articles are loaded on demand (one-shot query, refreshed by
 * pull-to-refresh) rather than via a persistent listener — the collection only
 * changes every 12h. Per-user article states ARE a small live listener, used
 * for read/saved/dismissed filtering and the unread badge.
 */
@Injectable({ providedIn: 'root' })
export class NewsService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);

  readonly articles = signal<NewsArticle[]>([]);
  readonly loading = signal(false);
  private loadedOnce = false;

  private readonly states = toSignal(
    this.auth.currentUser$.pipe(
      switchMap((user) =>
        user
          ? (collectionData(this.statesCol(user.uid), { idField: 'id' }) as Observable<
              ArticleStateDoc[]
            >)
          : of<ArticleStateDoc[]>([])
      )
    ),
    { initialValue: [] as ArticleStateDoc[] }
  );

  /** Map of articleId -> state for quick lookups. */
  readonly stateMap = computed(() => {
    const m = new Map<string, ArticleState>();
    for (const s of this.states()) {
      if (s.id) {
        m.set(s.id, s.state);
      }
    }
    return m;
  });

  /** Articles with no state for the current user (approximate unread count). */
  readonly unreadCount = computed(() => {
    const map = this.stateMap();
    return this.articles().filter((a) => a.id && !map.has(a.id)).length;
  });

  private readonly preferences = toSignal(
    this.auth.currentUser$.pipe(
      switchMap((user) =>
        user
          ? (docData(this.prefsDoc(user.uid)) as Observable<
              UserNewsPreferences | undefined
            >)
          : of<UserNewsPreferences | undefined>(undefined)
      )
    ),
    { initialValue: undefined }
  );

  /** Current feed prefs, falling back to defaults until one is saved. */
  readonly effectivePrefs = computed<NewsPrefs>(() => {
    const p = this.preferences();
    if (!p) {
      return DEFAULT_NEWS_PREFS;
    }
    return {
      watchKeywords: p.watchKeywords ?? [],
      watchDistilleries: p.watchDistilleries ?? [],
      activeCategories: p.activeCategories ?? ['general'],
      excludeKeywords: p.excludeKeywords ?? [],
    };
  });

  /** One-shot prefs read for the settings page (avoids the listener race). */
  async loadPreferencesOnce(): Promise<NewsPrefs> {
    const uid = this.auth.snapshotUser?.uid;
    if (!uid) {
      return DEFAULT_NEWS_PREFS;
    }
    const snap = await getDoc(this.prefsDoc(uid));
    if (!snap.exists()) {
      return DEFAULT_NEWS_PREFS;
    }
    const p = snap.data() as UserNewsPreferences;
    return {
      watchKeywords: p.watchKeywords ?? [],
      watchDistilleries: p.watchDistilleries ?? [],
      activeCategories: p.activeCategories ?? ['general'],
      excludeKeywords: p.excludeKeywords ?? [],
    };
  }

  async savePreferences(prefs: NewsPrefs): Promise<void> {
    const uid = this.requireUid();
    await setDoc(
      this.prefsDoc(uid),
      { ...prefs, updatedAt: serverTimestamp() },
      { merge: true }
    );
  }

  /** Loads the latest articles (newest first). */
  async loadLatest(): Promise<void> {
    this.loading.set(true);
    try {
      const snap = await getDocs(
        query(
          collection(this.firestore, 'newsArticles'),
          orderBy('publishedAt', 'desc'),
          limit(FEED_LIMIT)
        )
      );
      this.articles.set(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }) as NewsArticle)
      );
      this.loadedOnce = true;
    } finally {
      this.loading.set(false);
    }
  }

  /** Loads once (e.g. on first feed visit); no-op afterwards. */
  async ensureLoaded(): Promise<void> {
    if (!this.loadedOnce) {
      await this.loadLatest();
    }
  }

  async setState(articleId: string, state: ArticleState): Promise<void> {
    const uid = this.requireUid();
    await setDoc(this.stateDoc(uid, articleId), {
      state,
      updatedAt: serverTimestamp(),
    });
  }

  async clearState(articleId: string): Promise<void> {
    const uid = this.requireUid();
    await deleteDoc(this.stateDoc(uid, articleId));
  }

  private statesCol(uid: string) {
    return collection(this.firestore, `users/${uid}/articleStates`);
  }
  private stateDoc(uid: string, articleId: string) {
    return doc(this.firestore, `users/${uid}/articleStates/${articleId}`);
  }
  private prefsDoc(uid: string) {
    return doc(this.firestore, `userNewsPreferences/${uid}`);
  }
  private requireUid(): string {
    const uid = this.auth.snapshotUser?.uid;
    if (!uid) {
      throw new Error('Not signed in.');
    }
    return uid;
  }
}
