import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  addDoc,
  collection,
  collectionData,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from '@angular/fire/firestore';
import { Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { Sighting } from '../../models';
import { AuthService } from '../auth/auth.service';
import { bestNonStalePrice } from '../../shared/utils/sighting';

/** Caller-supplied sighting fields; the service fills the rest. */
export type SightingInput = Omit<
  Sighting,
  'id' | 'markedStaleManually' | 'createdAt'
>;

/**
 * Price sightings live under a wishlist entry:
 *   /users/{uid}/wishlistEntries/{entryId}/sightings/{sightingId}
 *
 * Each mutation recomputes the parent entry's cached bestSightingPrice (lowest
 * non-stale price). Listeners are opened per-viewed-entry by the detail page.
 */
@Injectable({ providedIn: 'root' })
export class SightingService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);

  /** Realtime sightings for an entry, lowest price first. */
  sightingsFor(entryId: string): Observable<Sighting[]> {
    return this.auth.currentUser$.pipe(
      switchMap((user) =>
        user
          ? (collectionData(
              query(this.col(user.uid, entryId), orderBy('price', 'asc')),
              { idField: 'id' }
            ) as Observable<Sighting[]>)
          : of<Sighting[]>([])
      )
    );
  }

  async add(entryId: string, input: SightingInput): Promise<void> {
    const uid = this.requireUid();
    await addDoc(this.col(uid, entryId), {
      ...input,
      markedStaleManually: false,
      createdAt: serverTimestamp(),
    });
    await this.recomputeBestPrice(uid, entryId);
  }

  async setStale(
    entryId: string,
    sightingId: string,
    stale: boolean
  ): Promise<void> {
    const uid = this.requireUid();
    await updateDoc(this.sightingDoc(uid, entryId, sightingId), {
      markedStaleManually: stale,
    });
    await this.recomputeBestPrice(uid, entryId);
  }

  async remove(entryId: string, sightingId: string): Promise<void> {
    const uid = this.requireUid();
    await deleteDoc(this.sightingDoc(uid, entryId, sightingId));
    await this.recomputeBestPrice(uid, entryId);
  }

  /** Recomputes and caches the parent entry's bestSightingPrice. */
  private async recomputeBestPrice(uid: string, entryId: string): Promise<void> {
    const snap = await getDocs(this.col(uid, entryId));
    const best = bestNonStalePrice(
      snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Sighting)
    );
    await updateDoc(this.entryDoc(uid, entryId), {
      bestSightingPrice: best,
      updatedAt: serverTimestamp(),
    });
  }

  private col(uid: string, entryId: string) {
    return collection(
      this.firestore,
      `users/${uid}/wishlistEntries/${entryId}/sightings`
    );
  }
  private sightingDoc(uid: string, entryId: string, sightingId: string) {
    return doc(
      this.firestore,
      `users/${uid}/wishlistEntries/${entryId}/sightings/${sightingId}`
    );
  }
  private entryDoc(uid: string, entryId: string) {
    return doc(this.firestore, `users/${uid}/wishlistEntries/${entryId}`);
  }

  private requireUid(): string {
    const uid = this.auth.snapshotUser?.uid;
    if (!uid) {
      throw new Error('Not signed in.');
    }
    return uid;
  }
}
