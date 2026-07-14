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
      this.applyAppBadge(0);
      return 0;
    }
    try {
      const snap = await getCountFromServer(
        query(this.col(uid), where('read', '==', false))
      );
      const count = snap.data().count;
      this.applyAppBadge(count);
      return count;
    } catch {
      // Fail soft: a pending (unapproved) account is denied subcollection
      // reads by the BB-210 rules — the launch badge sync must not surface
      // an error for them. Offline/transient failures land here too.
      this.applyAppBadge(0);
      return 0;
    }
  }

  async markRead(id: string): Promise<void> {
    const uid = this.auth.snapshotUser?.uid;
    if (!uid) {
      return;
    }
    await updateDoc(doc(this.firestore, `users/${uid}/notifications/${id}`), {
      read: true,
    });
    // Resync the OS app-icon badge to the remaining unread (BB-093).
    void this.unreadCount();
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
    this.applyAppBadge(0);
  }

  /**
   * Deletes notifications outright (BB-214: user-pruned inbox — edit mode and
   * swipe-to-delete). One batched write (list is capped at 50, well under the
   * 500-op batch limit), then a badge resync since unread items may have gone.
   */
  async remove(ids: string[]): Promise<void> {
    const uid = this.auth.snapshotUser?.uid;
    if (!uid || !ids.length) {
      return;
    }
    const batch = writeBatch(this.firestore);
    for (const id of ids) {
      batch.delete(doc(this.firestore, `users/${uid}/notifications/${id}`));
    }
    await batch.commit();
    void this.unreadCount();
  }

  /** Clear the OS app-icon badge, e.g. on sign-out (BB-093). */
  clearAppBadge(): void {
    this.applyAppBadge(0);
  }

  /**
   * Reflect the unread count onto the OS app-icon badge via the Badging API
   * (BB-093). Supported on installed PWAs — Android and iOS 16.4+; a silent
   * no-op everywhere else.
   */
  private applyAppBadge(count: number): void {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    try {
      if (count > 0) {
        void nav.setAppBadge?.(count);
      } else {
        void nav.clearAppBadge?.();
      }
    } catch {
      // Badging API unavailable — ignore.
    }
  }

  private col(uid: string) {
    return collection(this.firestore, `users/${uid}/notifications`);
  }
}
