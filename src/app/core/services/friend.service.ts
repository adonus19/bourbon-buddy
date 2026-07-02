import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Observable, from, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import {
  BlockedUser,
  FriendRequest,
  FriendView,
  PublicProfile,
} from '../../models';
import { AuthService } from '../auth/auth.service';
import { usernameKey, validateUsername } from '../../shared/utils/username';

/**
 * Social graph: friend search, requests, and (later) edges/blocks (BB-101–103).
 *
 * Cost discipline:
 *  - Search resolves an exact handle with at most three keyed `getDoc`s
 *    (username reservation → public profile → my block of them) — never a query
 *    or collection scan, so no index and a tiny, bounded read cost.
 *  - All multi-user writes (request create, accept, remove) go through Admin-SDK
 *    callables, not client fan-out — the client can't write another user's docs.
 *  - The request streams are returned as Observables, not always-on signals, so
 *    a listener only lives while the Friends page is on screen.
 */
@Injectable({ providedIn: 'root' })
export class FriendService {
  private readonly firestore = inject(Firestore);
  private readonly functions = inject(Functions);
  private readonly auth = inject(AuthService);

  /**
   * Looks up a discoverable user by EXACT handle. Returns null when the handle
   * is invalid/unclaimed, points at yourself, isn't discoverable, or belongs to
   * someone you've blocked. (Reverse blocks are enforced server-side on send.)
   */
  async searchByUsername(raw: string): Promise<PublicProfile | null> {
    const me = this.auth.snapshotUser?.uid;
    if (!me || validateUsername(raw)) {
      return null;
    }
    const lower = usernameKey(raw);

    const reservation = await getDoc(doc(this.firestore, `usernames/${lower}`));
    if (!reservation.exists()) {
      return null;
    }
    const uid = reservation.get('uid') as string;
    if (uid === me) {
      return null;
    }

    const pubSnap = await getDoc(doc(this.firestore, `publicProfiles/${uid}`));
    if (!pubSnap.exists()) {
      return null;
    }
    const profile = { id: pubSnap.id, ...pubSnap.data() } as PublicProfile;
    if (!profile.isDiscoverable) {
      return null;
    }

    const blocked = await getDoc(doc(this.firestore, `users/${me}/blocks/${uid}`));
    if (blocked.exists()) {
      return null;
    }
    return profile;
  }

  /** Sends a friend request via the guarded callable. */
  async sendFriendRequest(toUid: string): Promise<void> {
    const callable = httpsCallable<{ toUid: string }, { id: string }>(
      this.functions,
      'sendFriendRequest'
    );
    await callable({ toUid });
  }

  /** Recipient accepts or declines a pending request via the guarded callable. */
  async respondToRequest(
    requestId: string,
    action: 'accept' | 'decline'
  ): Promise<void> {
    const callable = httpsCallable<
      { requestId: string; action: 'accept' | 'decline' },
      { ok: boolean }
    >(this.functions, 'respondToFriendRequest');
    await callable({ requestId, action });
  }

  /** Sender cancels their own pending outgoing request (rules-permitted delete). */
  async cancelRequest(requestId: string): Promise<void> {
    await deleteDoc(doc(this.firestore, `friendRequests/${requestId}`));
  }

  /** My pending outgoing requests. Subscribe only where shown (page-scoped). */
  outgoingRequests$(): Observable<FriendRequest[]> {
    return this.auth.currentUser$.pipe(
      switchMap((user) =>
        user
          ? (collectionData(
              query(
                this.requests(),
                where('fromUid', '==', user.uid),
                where('status', '==', 'pending')
              ),
              { idField: 'id' }
            ) as Observable<FriendRequest[]>)
          : of<FriendRequest[]>([])
      )
    );
  }

  /** Pending requests sent TO me. Subscribe only where shown (page-scoped). */
  incomingRequests$(): Observable<FriendRequest[]> {
    return this.auth.currentUser$.pipe(
      switchMap((user) =>
        user
          ? (collectionData(
              query(
                this.requests(),
                where('toUid', '==', user.uid),
                where('status', '==', 'pending')
              ),
              { idField: 'id' }
            ) as Observable<FriendRequest[]>)
          : of<FriendRequest[]>([])
      )
    );
  }

  /** My friends, hydrated from each edge's public profile. Page-scoped. */
  friends$(): Observable<FriendView[]> {
    return this.auth.currentUser$.pipe(
      switchMap((user) => {
        if (!user) {
          return of<FriendView[]>([]);
        }
        const edges$ = collectionData(
          collection(this.firestore, `users/${user.uid}/friends`),
          { idField: 'id' }
        ) as Observable<{ id: string }[]>;
        return edges$.pipe(
          switchMap((edges) =>
            edges.length
              ? from(this.hydrateFriends(edges))
              : of<FriendView[]>([])
          )
        );
      })
    );
  }

  /** Users I've blocked (denormalized display, no extra reads). Page-scoped. */
  blocked$(): Observable<BlockedUser[]> {
    return this.auth.currentUser$.pipe(
      switchMap((user) =>
        user
          ? (collectionData(
              collection(this.firestore, `users/${user.uid}/blocks`),
              { idField: 'id' }
            ) as Observable<BlockedUser[]>)
          : of<BlockedUser[]>([])
      )
    );
  }

  /** Removes a friendship (both edges + counts) via the guarded callable. */
  async removeFriend(friendUid: string): Promise<void> {
    const callable = httpsCallable<{ friendUid: string }, { ok: boolean }>(
      this.functions,
      'removeFriend'
    );
    await callable({ friendUid });
  }

  /** Blocks a user (severs friendship, clears pending) via the callable. */
  async blockUser(blockedUid: string): Promise<void> {
    const callable = httpsCallable<{ blockedUid: string }, { ok: boolean }>(
      this.functions,
      'blockUser'
    );
    await callable({ blockedUid });
  }

  /** Unblocks a user — a plain owner-side delete, no callable needed. */
  async unblockUser(blockedUid: string): Promise<void> {
    const uid = this.auth.snapshotUser?.uid;
    if (!uid) {
      return;
    }
    await deleteDoc(doc(this.firestore, `users/${uid}/blocks/${blockedUid}`));
  }

  /** One-shot read of a public profile (for the tap-through profile view). */
  async getPublicProfile(uid: string): Promise<PublicProfile | null> {
    const snap = await getDoc(doc(this.firestore, `publicProfiles/${uid}`));
    return snap.exists()
      ? ({ id: snap.id, ...snap.data() } as PublicProfile)
      : null;
  }

  /**
   * One-shot hydrated friends list (BB-111 feed): reads the friends edges once
   * and resolves their public profiles. Used by pull surfaces that want a
   * snapshot (UIDs + display) without opening a listener.
   */
  async friendsOnce(): Promise<FriendView[]> {
    const uid = this.auth.snapshotUser?.uid;
    if (!uid) {
      return [];
    }
    const snap = await getDocs(
      collection(this.firestore, `users/${uid}/friends`)
    );
    if (snap.empty) {
      return [];
    }
    return this.hydrateFriends(snap.docs.map((d) => ({ id: d.id })));
  }

  private async hydrateFriends(edges: { id: string }[]): Promise<FriendView[]> {
    const views = await Promise.all(
      edges.map(async (e) => {
        const snap = await getDoc(
          doc(this.firestore, `publicProfiles/${e.id}`)
        );
        const p = snap.data() as PublicProfile | undefined;
        return {
          uid: e.id,
          displayName: p?.displayName ?? 'Bourbon Buddy',
          username: p?.username ?? null,
          avatarUrl: p?.avatarUrl ?? null,
          homeRegion: p?.homeRegion ?? null,
        } as FriendView;
      })
    );
    return views.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  private requests() {
    return collection(this.firestore, 'friendRequests');
  }
}
