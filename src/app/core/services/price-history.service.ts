import { Injectable, inject } from '@angular/core';
import {
  DocumentData,
  Firestore,
  QueryDocumentSnapshot,
  collection,
  getDocs,
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
    friendUids: string[] = []
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
    const uids = friendUidsForQuery(
      friendUids,
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
}
