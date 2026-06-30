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
  where,
} from '@angular/fire/firestore';
import { Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { Sighting, SightingVisibility } from '../../models';
import { AuthService } from '../auth/auth.service';
import { bestNonStalePrice } from '../../shared/utils/sighting';

/** Caller-supplied sighting fields; the service fills the rest. */
export type SightingInput = Pick<
  Sighting,
  'storeName' | 'price' | 'sightingDate' | 'city' | 'state' | 'notes'
>;

/**
 * First-class, catalog-keyed sightings (BB-161): top-level `/sightings`,
 * keyed by `bourbonId`, decoupled from any wishlist. A wishlist entry's
 * sightings are a query by `bourbonId`. Each mutation recomputes the user's
 * cached `bestSightingPrice` for any of their wishlist entries on that bottle.
 * (Friend visibility + cross-user recompute land in BB-110/112.)
 */
@Injectable({ providedIn: 'root' })
export class SightingService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);

  /** The current user's own sightings for a bottle, lowest price first. */
  sightingsForBottle(bourbonId: string): Observable<Sighting[]> {
    return this.auth.currentUser$.pipe(
      switchMap((user) =>
        user
          ? (collectionData(
              query(
                this.col(),
                where('bourbonId', '==', bourbonId),
                where('spotterUid', '==', user.uid),
                orderBy('price', 'asc')
              ),
              { idField: 'id' }
            ) as Observable<Sighting[]>)
          : of<Sighting[]>([])
      )
    );
  }

  async add(
    bourbonId: string,
    bourbonName: string | null,
    input: SightingInput,
    visibility: SightingVisibility = 'private'
  ): Promise<void> {
    const uid = this.requireUid();
    await addDoc(this.col(), {
      ...input,
      bourbonId,
      bourbonName: bourbonName ?? null,
      spotterUid: uid,
      markedStaleManually: false,
      visibility,
      createdAt: serverTimestamp(),
    });
    await this.recomputeBestPrice(uid, bourbonId);
  }

  async setStale(
    sightingId: string,
    bourbonId: string,
    stale: boolean
  ): Promise<void> {
    const uid = this.requireUid();
    await updateDoc(this.sightingDoc(sightingId), { markedStaleManually: stale });
    await this.recomputeBestPrice(uid, bourbonId);
  }

  async remove(sightingId: string, bourbonId: string): Promise<void> {
    const uid = this.requireUid();
    await deleteDoc(this.sightingDoc(sightingId));
    await this.recomputeBestPrice(uid, bourbonId);
  }

  /**
   * Recomputes `bestSightingPrice` (lowest non-stale price among the user's own
   * sightings) onto any of the user's wishlist entries for this bottle.
   */
  private async recomputeBestPrice(
    uid: string,
    bourbonId: string
  ): Promise<void> {
    const mine = await getDocs(
      query(
        this.col(),
        where('bourbonId', '==', bourbonId),
        where('spotterUid', '==', uid)
      )
    );
    const best = bestNonStalePrice(
      mine.docs.map((d) => ({ id: d.id, ...d.data() }) as Sighting)
    );

    const entries = await getDocs(
      query(
        collection(this.firestore, `users/${uid}/wishlistEntries`),
        where('bourbonId', '==', bourbonId)
      )
    );
    await Promise.all(
      entries.docs.map((d) =>
        updateDoc(d.ref, {
          bestSightingPrice: best,
          updatedAt: serverTimestamp(),
        })
      )
    );
  }

  private col() {
    return collection(this.firestore, 'sightings');
  }
  private sightingDoc(sightingId: string) {
    return doc(this.firestore, `sightings/${sightingId}`);
  }

  private requireUid(): string {
    const uid = this.auth.snapshotUser?.uid;
    if (!uid) {
      throw new Error('Not signed in.');
    }
    return uid;
  }
}
