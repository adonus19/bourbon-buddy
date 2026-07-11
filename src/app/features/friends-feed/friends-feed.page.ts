import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  InfiniteScrollCustomEvent,
  NavController,
  RefresherCustomEvent,
  ToastController,
} from '@ionic/angular';
import {
  DocumentData,
  QueryDocumentSnapshot,
  Timestamp,
} from '@angular/fire/firestore';

import {
  ACTIVE_WISHLIST_STATUSES,
  FriendView,
  Sighting,
} from '../../models';
import { SightingService } from '../../core/services/sighting.service';
import { FriendService } from '../../core/services/friend.service';
import { TasteMatchService } from '../../core/services/taste-match.service';
import { WishlistService } from '../../core/services/wishlist.service';
import {
  SightingFreshness,
  isSightingStale,
  sightingFreshness,
} from '../../shared/utils/sighting';
import { relativeTime } from '../../shared/utils/relative-time';
import { OnboardingService } from '../../core/onboarding/onboarding.service';
import { TIPS } from '../../core/onboarding/tips.config';

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
  private readonly taste = inject(TasteMatchService);
  private readonly router = inject(Router);
  private readonly nav = inject(NavController);
  private readonly toast = inject(ToastController);
  private readonly onboarding = inject(OnboardingService);

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
    // Introduce the map + taste matches once. The map button is always in the
    // toolbar, so this fires on the first Friends visit regardless of feed data.
    setTimeout(() => void this.onboarding.showTipOnce(TIPS.social), 500);
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

  /**
   * Taste Match badge (BB-199) from tags denormalized at logSighting. The
   * hunt-list match is the stronger, more specific signal — when it shows,
   * this badge stays quiet (same one-signal precedence the alerts use).
   */
  tasteTags(s: Sighting): string[] {
    if (this.matchEntryId(s)) {
      return [];
    }
    const res = this.taste.matches(s.flavorTags);
    return res.matched ? res.tags : [];
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

  // --- Community confirmation (BB-194) ---

  /** Sighting id with a vote in flight (disables its buttons). */
  readonly voting = signal<string | null>(null);

  /** Votes are only possible on sightings that carry a location to verify. */
  canVote(s: Sighting): boolean {
    return !!s.id && s.lat != null && s.lng != null;
  }

  async vote(s: Sighting, verdict: 'confirm' | 'dispute'): Promise<void> {
    if (!s.id || this.voting()) {
      return;
    }
    this.voting.set(s.id);
    try {
      const res = await this.sightings.confirm(s.id, verdict);
      if (res.changed) {
        this.applyVoteLocally(s.id, verdict);
      }
      await this.presentToast(
        verdict === 'confirm'
          ? 'Thanks — confirmed still on the shelf.'
          : 'Thanks — marked as gone.'
      );
    } catch (err) {
      await this.presentToast(this.voteErrorMessage(err));
    } finally {
      this.voting.set(null);
    }
  }

  /**
   * Optimistic count bump so the feed (one-shot reads, no listener) reflects
   * the vote immediately; the next refresh loads the server's truth.
   */
  private applyVoteLocally(id: string, verdict: 'confirm' | 'dispute'): void {
    this.items.update((cur) =>
      cur.map((s) =>
        s.id === id
          ? {
              ...s,
              confirmCount: (s.confirmCount ?? 0) + (verdict === 'confirm' ? 1 : 0),
              disputeCount: (s.disputeCount ?? 0) + (verdict === 'dispute' ? 1 : 0),
              lastConfirmedAt:
                verdict === 'confirm' ? Timestamp.now() : s.lastConfirmedAt,
            }
          : s
      )
    );
  }

  private voteErrorMessage(err: unknown): string {
    if (err instanceof Error && err.message === 'LOCATION_REQUIRED') {
      return 'Turn on location to confirm — votes only count from the store.';
    }
    const msg = (err as { message?: string })?.message;
    return msg && msg.length < 120
      ? msg
      : "Couldn't record your vote. Try again.";
  }

  private async presentToast(message: string): Promise<void> {
    const t = await this.toast.create({ message, duration: 2500, position: 'top' });
    await t.present();
  }
}
