import { Injectable, Signal, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  getDoc,
  orderBy,
  query,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { Observable, of } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';

import { SharedItem, SharedItemStatus } from '../../models';
import { AuthService } from '../auth/auth.service';

/**
 * Items shared WITH the current user (BB-230). Reads live under the recipient's
 * own subcollection (`users/{uid}/sharedItems`), written cross-user only by the
 * `shareBottle`/`shareList` callables. `get()` + `markStatus()` back the receive
 * chooser (BB-230c, reached by the notification deep-link); the `received` signal
 * backs the browsable "Shared with me" segment (BB-230e).
 */
@Injectable({ providedIn: 'root' })
export class SharedItemsService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);

  /** False until the first snapshot arrives — drives the segment skeleton. */
  readonly receivedLoaded = signal(false);

  /**
   * PENDING shares received by the signed-in user, newest-first. ONE shared
   * listener (state-holder pattern) matching the `sharedItems (status ASC,
   * createdAt DESC)` composite index. Acting on a share flips its status away
   * from `pending`, so it drops out of this list automatically.
   */
  readonly received: Signal<SharedItem[]> = toSignal(
    this.auth.currentUser$.pipe(
      tap(() => this.receivedLoaded.set(false)),
      switchMap((user) =>
        user
          ? (
              collectionData(
                query(
                  collection(this.firestore, `users/${user.uid}/sharedItems`),
                  where('status', '==', 'pending'),
                  orderBy('createdAt', 'desc')
                ),
                { idField: 'id' }
              ) as Observable<SharedItem[]>
            ).pipe(
              tap(() => this.receivedLoaded.set(true)),
              catchError(() => {
                this.receivedLoaded.set(true);
                return of<SharedItem[]>([]);
              })
            )
          : of<SharedItem[]>([]).pipe(tap(() => this.receivedLoaded.set(true)))
      )
    ),
    { initialValue: [] as SharedItem[] }
  );

  /** One-shot read of a share the current user received, or null. */
  async get(id: string): Promise<SharedItem | null> {
    const uid = this.auth.snapshotUser?.uid;
    if (!uid || !id) {
      return null;
    }
    const snap = await getDoc(
      doc(this.firestore, `users/${uid}/sharedItems/${id}`)
    );
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as SharedItem) : null;
  }

  /** Mark a received share as acted-on (`imported`) or `dismissed`. */
  async markStatus(id: string, status: SharedItemStatus): Promise<void> {
    const uid = this.auth.snapshotUser?.uid;
    if (!uid || !id) {
      return;
    }
    await updateDoc(
      doc(this.firestore, `users/${uid}/sharedItems/${id}`),
      { status }
    );
  }
}
