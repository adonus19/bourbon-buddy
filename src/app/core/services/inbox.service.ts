import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  getCountFromServer,
  limit,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
} from '@angular/fire/firestore';
import { Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AppNotification } from '../../models';
import { AuthService } from '../auth/auth.service';

/**
 * In-app notification inbox (BB-113). Records are written server-side by the
 * send-helper; this service reads them and marks them read.
 *
 * Cost discipline: the inbox list listener is opened only by the inbox page
 * (page-scoped), and the unread badge uses a one-shot COUNT aggregation
 * (~1 read) rather than an always-on listener over the collection.
 */
@Injectable({ providedIn: 'root' })
export class InboxService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);

  /** Recent inbox items, newest-first. Subscribe only where shown. */
  inbox$(max = 50): Observable<AppNotification[]> {
    return this.auth.currentUser$.pipe(
      switchMap((user) =>
        user
          ? (collectionData(
              query(this.col(user.uid), orderBy('createdAt', 'desc'), limit(max)),
              { idField: 'id' }
            ) as Observable<AppNotification[]>)
          : of<AppNotification[]>([])
      )
    );
  }

  /** One-shot unread count for the badge (server aggregation, ~1 read). */
  async unreadCount(): Promise<number> {
    const uid = this.auth.snapshotUser?.uid;
    if (!uid) {
      return 0;
    }
    const snap = await getCountFromServer(
      query(this.col(uid), where('read', '==', false))
    );
    return snap.data().count;
  }

  async markRead(id: string): Promise<void> {
    const uid = this.auth.snapshotUser?.uid;
    if (!uid) {
      return;
    }
    await updateDoc(doc(this.firestore, `users/${uid}/notifications/${id}`), {
      read: true,
    });
  }

  async markAllRead(items: AppNotification[]): Promise<void> {
    const uid = this.auth.snapshotUser?.uid;
    const unread = items.filter((n) => !n.read && n.id);
    if (!uid || !unread.length) {
      return;
    }
    const batch = writeBatch(this.firestore);
    for (const n of unread) {
      batch.update(doc(this.firestore, `users/${uid}/notifications/${n.id}`), {
        read: true,
      });
    }
    await batch.commit();
  }

  private col(uid: string) {
    return collection(this.firestore, `users/${uid}/notifications`);
  }
}
