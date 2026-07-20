import { Injectable, inject } from '@angular/core';
import {
  DocumentData,
  Firestore,
  QueryDocumentSnapshot,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from '@angular/fire/firestore';

import { PriceHistoryPoint } from '../../models';
import { AuthService } from '../auth/auth.service';
import {
  friendUidsForQuery,
  mergePricePoints,
} from '../../shared/utils/price-history';

/**
 * Reads durable price history (BB-202/203) for a bottle. Two bounded one-shot
 * `getDocs` — the user's own points (any visibility) and their friends'
 * friends-shared points — merged and deduped client-side, mirroring
 * `SightingService.nearbySightings`.
 *
 * A detail page is a PULL surface, so this is a one-shot read, never a listener;
 * and the reads live in an explicit method, so nothing here runs inside a
 * `computed()`/`effect()` (Firebase call discipline).
 */
@Injectable({ providedIn: 'root' })
export class PriceHistoryService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);

  /** Max friend UIDs per `in` query (Firestore's `in` cap). */
  static readonly FRIEND_UID_CAP = 30;

  /**
   * The visible price history for a bottle, oldest → newest. Pass the viewer's
   * accepted-friend UIDs (e.g. from `FriendService.friendsOnce()`) to include
   * their friends-shared points; omit for own-only.
   */
  async priceHistoryForBottle(
    bourbonId: string,
    // BB-228c: accepts a PENDING friend list. The own-points query does not
    // depend on friend uids, so it is issued first and runs while the friend
    // lookup resolves. Callers used to await friendsOnce() and only then call
    // this, which serialized two round trips (measured in BB-228a).
    friendUids: string[] | Promise<string[]> = []
  ): Promise<PriceHistoryPoint[]> {
    const uid = this.auth.snapshotUser?.uid;
    if (!uid) {
      return [];
    }
    const col = collection(this.firestore, 'priceHistory');
    const toPoints = (
      docs: QueryDocumentSnapshot<DocumentData>[]
    ): PriceHistoryPoint[] =>
      docs.map((d) => ({ id: d.id, ...d.data() }) as PriceHistoryPoint);

    const reads: Promise<PriceHistoryPoint[]>[] = [
      // Own points, any visibility. Uses the
      // (bourbonId, spotterUid, sightingDate) index.
      getDocs(
        query(
          col,
          where('bourbonId', '==', bourbonId),
          where('spotterUid', '==', uid),
          orderBy('sightingDate', 'asc')
        )
      ).then((s) => toPoints(s.docs)),
    ];

    // Friends' shared points. Uses the
    // (bourbonId, visibility, spotterUid, sightingDate) index.
    // The own-points read above is already in flight at this point, so awaiting
    // the friend list here costs nothing extra.
    const uids = friendUidsForQuery(
      await friendUids,
      uid,
      PriceHistoryService.FRIEND_UID_CAP
    );
    if (uids.length) {
      reads.push(
        getDocs(
          query(
            col,
            where('bourbonId', '==', bourbonId),
            where('visibility', '==', 'friends'),
            where('spotterUid', 'in', uids),
            orderBy('sightingDate', 'asc')
          )
        ).then((s) => toPoints(s.docs))
      );
    }

    const [own, friends = []] = await Promise.all(reads);
    return mergePricePoints(own, friends);
  }

  /** Max points read for one store view — bounds the detail page's read cost. */
  static readonly STORE_POINT_CAP = 100;

  /** Max recent own points scanned for the BB-225 store suggestions. */
  static readonly RECENT_STORE_POINT_CAP = 50;

  /**
   * The user's OWN price points at one store, newest-first (BB-224 evidence).
   * Own-only by design: the evidence panel backs *your* read on the store, so a
   * friend's sighting there is not your receipt. Bounded one-shot read — a
   * detail page is a pull surface.
   *
   * Uses the (spotterUid, storeName, sightingDate desc) composite index.
   */
  async priceHistoryForStore(
    storeName: string,
    cap: number = PriceHistoryService.STORE_POINT_CAP
  ): Promise<PriceHistoryPoint[]> {
    const uid = this.auth.snapshotUser?.uid;
    const name = storeName.trim();
    if (!uid || !name) {
      return [];
    }
    const snap = await getDocs(
      query(
        collection(this.firestore, 'priceHistory'),
        where('spotterUid', '==', uid),
        where('storeName', '==', name),
        orderBy('sightingDate', 'desc'),
        limit(cap)
      )
    );
    return snap.docs.map(
      (d) => ({ id: d.id, ...d.data() }) as PriceHistoryPoint
    );
  }

  /**
   * The user's most recent own price points across all stores (BB-225) — fed to
   * `recentStores()` so the store form can offer places they've actually been
   * instead of making them type. Uses the (spotterUid, sightingDate desc) index.
   */
  async recentOwnPoints(
    cap: number = PriceHistoryService.RECENT_STORE_POINT_CAP
  ): Promise<PriceHistoryPoint[]> {
    const uid = this.auth.snapshotUser?.uid;
    if (!uid) {
      return [];
    }
    const snap = await getDocs(
      query(
        collection(this.firestore, 'priceHistory'),
        where('spotterUid', '==', uid),
        orderBy('sightingDate', 'desc'),
        limit(cap)
      )
    );
    return snap.docs.map(
      (d) => ({ id: d.id, ...d.data() }) as PriceHistoryPoint
    );
  }
}
