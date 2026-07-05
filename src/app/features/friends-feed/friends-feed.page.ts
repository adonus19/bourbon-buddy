import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  InfiniteScrollCustomEvent,
  NavController,
  RefresherCustomEvent,
} from '@ionic/angular';
import { DocumentData, QueryDocumentSnapshot } from '@angular/fire/firestore';

import {
  ACTIVE_WISHLIST_STATUSES,
  FriendView,
  Sighting,
} from '../../models';
import { SightingService } from '../../core/services/sighting.service';
import { FriendService } from '../../core/services/friend.service';
import { WishlistService } from '../../core/services/wishlist.service';
import {
  SightingFreshness,
  isSightingStale,
  sightingFreshness,
} from '../../shared/utils/sighting';
import { relativeTime } from '../../shared/utils/relative-time';

/**
 * Friends' Sightings Feed (BB-111): friends' shared sightings, newest-first,
 * paginated with one-shot reads (no live listener — the feed is a pull surface).
 *
 * Cost notes: the "on your hunt list" highlight is derived from the already-open
 * WishlistService listener (zero extra reads); "who shared it" comes from the
 * one friends read used to build the query, not a per-sighting profile lookup.
 */
@Component({
  selector: 'app-friends-feed',
  templateUrl: './friends-feed.page.html',
  styleUrls: ['./friends-feed.page.scss'],
  standalone: false,
})
export class FriendsFeedPage {
  private readonly sightings = inject(SightingService);
  private readonly friends = inject(FriendService);
  private readonly wishlist = inject(WishlistService);
  private readonly router = inject(Router);
  private readonly nav = inject(NavController);

  private readonly PAGE = 20;

  readonly loading = signal(true);
  readonly loadingError = signal(false);
  readonly hideStale = signal(false);
  readonly hasMore = signal(false);
  readonly items = signal<Sighting[]>([]);

  private last: QueryDocumentSnapshot<DocumentData> | null = null;
  private uids: string[] = [];
  private friendMap = new Map<string, FriendView>();

  /** active hunt-list bourbonId -> its entry id, from the loaded wishlist. */
  private readonly huntIndex = computed(() => {
    const map = new Map<string, string>();
    for (const e of this.wishlist.entries()) {
      if (
        e.id &&
        e.bourbonId &&
        ACTIVE_WISHLIST_STATUSES.includes(e.status) &&
        !map.has(e.bourbonId)
      ) {
        map.set(e.bourbonId, e.id);
      }
    }
    return map;
  });

  readonly visible = computed(() =>
    this.hideStale()
      ? this.items().filter((s) => !isSightingStale(s))
      : this.items()
  );

  ionViewWillEnter(): void {
    // First entry loads; re-entry keeps what's there (pull-to-refresh to update).
    if (this.loading()) {
      void this.load();
    }
  }

  /** Segment: switch to the Friends view within the Social tab. */
  onSegment(value: string): void {
    if (value === 'friends') {
      void this.nav.navigateRoot(['/tabs/social/friends'], { animated: false });
    }
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.loadingError.set(false);
    try {
      const friends = await this.friends.friendsOnce();
      this.friendMap = new Map(friends.map((f) => [f.uid, f]));
      this.uids = friends.map((f) => f.uid);
      this.last = null;
      const { items, last } = await this.sightings.friendsFeedPage(
        this.uids,
        this.PAGE
      );
      this.items.set(items);
      this.last = last;
      this.hasMore.set(!!last);
    } catch {
      this.loadingError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  async doRefresh(event: RefresherCustomEvent): Promise<void> {
    try {
      await this.load();
    } finally {
      await event.target.complete();
    }
  }

  async loadMore(event: InfiniteScrollCustomEvent): Promise<void> {
    try {
      if (!this.hasMore() || !this.last) {
        this.hasMore.set(false);
        return;
      }
      const { items, last } = await this.sightings.friendsFeedPage(
        this.uids,
        this.PAGE,
        this.last
      );
      this.items.update((cur) => [...cur, ...items]);
      this.last = last;
      this.hasMore.set(!!last);
    } finally {
      await event.target.complete();
    }
  }

  retry(): void {
    void this.load();
  }

  toggleStale(): void {
    this.hideStale.update((v) => !v);
  }

  spotterName(uid: string): string {
    return this.friendMap.get(uid)?.displayName ?? 'A friend';
  }

  isStale(s: Sighting): boolean {
    return isSightingStale(s);
  }

  freshness(s: Sighting): SightingFreshness {
    return sightingFreshness(s);
  }

  matchEntryId(s: Sighting): string | null {
    return this.huntIndex().get(s.bourbonId) ?? null;
  }

  when(s: Sighting): string {
    return relativeTime(s.createdAt?.toDate() ?? null);
  }

  openMatch(s: Sighting): void {
    const id = this.matchEntryId(s);
    if (id) {
      void this.router.navigate(['/wishlist', id]);
    }
  }
}
