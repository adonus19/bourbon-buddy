import { Injectable, Signal, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  Firestore,
  addDoc,
  collection,
  collectionData,
  deleteDoc,
  doc,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from '@angular/fire/firestore';
import { Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { WishlistEntry, WishlistStatus } from '../../models';
import { AuthService } from '../auth/auth.service';

/** Caller-supplied fields; the service fills the rest. */
export type WishlistInput = Omit<
  WishlistEntry,
  'id' | 'createdAt' | 'updatedAt' | 'bestSightingPrice'
>;

/**
 * State holder for the signed-in user's wishlist (Hunt List). ONE Firestore
 * listener over the whole collection; the page filters active vs. archived
 * (status === 'logged') and sorts client-side from the cached signal.
 * bestSightingPrice stays null until sightings arrive in Iteration 4.
 */
@Injectable({ providedIn: 'root' })
export class WishlistService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);

  readonly entries: Signal<WishlistEntry[]> = toSignal(
    this.auth.currentUser$.pipe(
      switchMap((user) =>
        user
          ? (collectionData(
              query(this.col(user.uid), orderBy('bourbonName')),
              { idField: 'id' }
            ) as Observable<WishlistEntry[]>)
          : of<WishlistEntry[]>([])
      )
    ),
    { initialValue: [] as WishlistEntry[] }
  );

  selectById(id: string): Signal<WishlistEntry | undefined> {
    return computed(() => this.entries().find((e) => e.id === id));
  }

  async add(input: WishlistInput): Promise<string> {
    const uid = this.requireUid();
    const ref = await addDoc(this.col(uid), {
      ...input,
      bestSightingPrice: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  }

  async update(id: string, input: WishlistInput): Promise<void> {
    const uid = this.requireUid();
    await updateDoc(this.docRef(uid, id), {
      ...input,
      updatedAt: serverTimestamp(),
    });
  }

  /** Used by "Found It — Log It" archiving (full flow lands in Iteration 4). */
  async setStatus(id: string, status: WishlistStatus): Promise<void> {
    const uid = this.requireUid();
    await updateDoc(this.docRef(uid, id), {
      status,
      updatedAt: serverTimestamp(),
    });
  }

  async remove(id: string): Promise<void> {
    const uid = this.requireUid();
    await deleteDoc(this.docRef(uid, id));
  }

  private col(uid: string) {
    return collection(this.firestore, `users/${uid}/wishlistEntries`);
  }

  private docRef(uid: string, id: string) {
    return doc(this.firestore, `users/${uid}/wishlistEntries/${id}`);
  }

  private requireUid(): string {
    const uid = this.auth.snapshotUser?.uid;
    if (!uid) {
      throw new Error('Not signed in.');
    }
    return uid;
  }
}
