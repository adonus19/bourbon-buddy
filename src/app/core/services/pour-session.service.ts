import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  Timestamp,
  addDoc,
  collection,
  collectionData,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from '@angular/fire/firestore';
import { Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { PourSession } from '../../models';
import { AuthService } from '../auth/auth.service';

/** Caller-supplied pour fields; the service fills createdAt. */
export type PourSessionInput = Omit<PourSession, 'id' | 'createdAt'>;

/**
 * Pour sessions for a purchased bottle:
 *   /users/{uid}/logEntries/{entryId}/pourSessions/{sessionId}
 * Listener opened per-viewed-entry by the log detail page.
 */
@Injectable({ providedIn: 'root' })
export class PourSessionService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);

  /** Realtime pour sessions for an entry, oldest first (chronological). */
  sessionsFor(entryId: string): Observable<PourSession[]> {
    return this.auth.currentUser$.pipe(
      switchMap((user) =>
        user
          ? (collectionData(
              query(this.col(user.uid, entryId), orderBy('pourDate', 'asc')),
              { idField: 'id' }
            ) as Observable<PourSession[]>)
          : of<PourSession[]>([])
      )
    );
  }

  async add(entryId: string, input: PourSessionInput): Promise<void> {
    const uid = this.requireUid();
    await addDoc(this.col(uid, entryId), {
      ...input,
      createdAt: serverTimestamp(),
    });
    await this.refreshLastPoured(uid, entryId);
  }

  async remove(entryId: string, sessionId: string): Promise<void> {
    const uid = this.requireUid();
    await deleteDoc(
      doc(
        this.firestore,
        `users/${uid}/logEntries/${entryId}/pourSessions/${sessionId}`
      )
    );
    await this.refreshLastPoured(uid, entryId);
  }

  /**
   * Denormalizes the latest pour date onto the parent entry so the Cellar list
   * can show "last pour" without opening a listener per card. Recomputed from
   * the sessions (one read) so it's correct after both adds and deletes.
   */
  private async refreshLastPoured(uid: string, entryId: string): Promise<void> {
    const snap = await getDocs(
      query(this.col(uid, entryId), orderBy('pourDate', 'desc'), limit(1))
    );
    const latest = snap.empty
      ? null
      : ((snap.docs[0].data()['pourDate'] as Timestamp | undefined) ?? null);
    await updateDoc(
      doc(this.firestore, `users/${uid}/logEntries/${entryId}`),
      { lastPouredAt: latest, updatedAt: serverTimestamp() }
    );
  }

  private col(uid: string, entryId: string) {
    return collection(
      this.firestore,
      `users/${uid}/logEntries/${entryId}/pourSessions`
    );
  }

  private requireUid(): string {
    const uid = this.auth.snapshotUser?.uid;
    if (!uid) {
      throw new Error('Not signed in.');
    }
    return uid;
  }
}
