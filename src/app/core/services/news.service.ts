import { Injectable, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  Firestore,
  QueryConstraint,
  QueryDocumentSnapshot,
  Timestamp,
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
  startAfter,
  where,
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
import { NewsWindow } from '../../shared/constants/news-sources';

/** Page size for cursor-based feed pagination (infinite scroll). */
const PAGE_SIZE = 25;

function windowCutoff(w: NewsWindow): Timestamp | null {
  if (w === 'all') {
    return null;
  }
  const days = w === '7d' ? 7 : 30;
  return Timestamp.fromMillis(Date.now() - days * 24 * 60 * 60 * 1000);
}

function toArticle(d: QueryDocumentSnapshot): NewsArticle {
  return { id: d.id, ...d.data() } as NewsArticle;
}

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
  readonly loadingMore = signal(false);
  readonly error = signal(false);
  readonly hasMore = signal(false);

  /** Feed filters (drive the Firestore query — changing one reloads the feed). */
  readonly window = signal<NewsWindow>('all');
  readonly source = signal<string | null>(null);

  /** Saved articles loaded by id, so the Saved tab is complete regardless of
   * how far the paginated feed has been scrolled. */
  readonly savedArticles = signal<NewsArticle[]>([]);
  readonly savedLoading = signal(false);

  private lastDoc: QueryDocumentSnapshot | null = null;
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

  private articlesCol() {
    return collection(this.firestore, 'newsArticles');
  }

  /** Query constraints honoring the source + time-window filters. */
  private feedConstraints(paged: boolean): QueryConstraint[] {
    const cons: QueryConstraint[] = [];
    const src = this.source();
    if (src) {
      cons.push(where('sourceName', '==', src));
    }
    const cutoff = windowCutoff(this.window());
    if (cutoff) {
      cons.push(where('publishedAt', '>=', cutoff));
    }
    cons.push(orderBy('publishedAt', 'desc'));
    if (paged && this.lastDoc) {
      cons.push(startAfter(this.lastDoc));
    }
    cons.push(limit(PAGE_SIZE));
    return cons;
  }

  /** Loads the first page (newest first), resetting pagination. */
  async loadLatest(): Promise<void> {
    this.loading.set(true);
    this.error.set(false);
    this.lastDoc = null;
    try {
      const snap = await getDocs(query(this.articlesCol(), ...this.feedConstraints(false)));
      this.articles.set(snap.docs.map(toArticle));
      this.lastDoc = snap.docs[snap.docs.length - 1] ?? null;
      this.hasMore.set(snap.size === PAGE_SIZE);
      this.loadedOnce = true;
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /** Appends the next page (infinite scroll). No-op when nothing more to load. */
  async loadMore(): Promise<void> {
    if (this.loadingMore() || this.loading() || !this.hasMore() || !this.lastDoc) {
      return;
    }
    this.loadingMore.set(true);
    try {
      const snap = await getDocs(query(this.articlesCol(), ...this.feedConstraints(true)));
      this.articles.update((a) => [...a, ...snap.docs.map(toArticle)]);
      this.lastDoc = snap.docs[snap.docs.length - 1] ?? this.lastDoc;
      this.hasMore.set(snap.size === PAGE_SIZE);
    } catch {
      this.hasMore.set(false); // stop trying on error; keep what we have
    } finally {
      this.loadingMore.set(false);
    }
  }

  setWindow(w: NewsWindow): void {
    if (w !== this.window()) {
      this.window.set(w);
      void this.loadLatest();
    }
  }

  setSource(s: string | null): void {
    if (s !== this.source()) {
      this.source.set(s);
      void this.loadLatest();
    }
  }

  /** Fetches the user's saved articles by id (small set) for the Saved tab. */
  async loadSaved(): Promise<void> {
    const ids = [...this.stateMap().entries()]
      .filter(([, s]) => s === 'saved')
      .map(([id]) => id);
    this.savedLoading.set(true);
    try {
      const snaps = await Promise.all(
        ids.map((id) => getDoc(doc(this.firestore, `newsArticles/${id}`)))
      );
      this.savedArticles.set(
        snaps
          .filter((s) => s.exists())
          .map((s) => ({ id: s.id, ...s.data() }) as NewsArticle)
      );
    } finally {
      this.savedLoading.set(false);
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
