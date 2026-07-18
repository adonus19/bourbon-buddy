import { Injectable, Signal, computed, inject, signal } from '@angular/core';
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
import { catchError, switchMap, tap } from 'rxjs/operators';

import { StoreNote } from '../../models';
import { normalizeBottleName } from '../../shared/utils/normalize-name';
import { AuthService } from '../auth/auth.service';

/** Caller-supplied fields; the service derives `nameNormalized` and timestamps. */
export type StoreInput = Omit<
  StoreNote,
  'id' | 'nameNormalized' | 'createdAt' | 'updatedAt'
>;

/**
 * State holder for the signed-in user's store notes ("My Stores", BB-223). ONE
 * Firestore listener over `/users/{uid}/stores`; the list page and the BB-225
 * sighting handoff read the cached `stores()` signal (identity matching is a
 * pure client check — zero extra reads). Mirrors WishlistService.
 */
@Injectable({ providedIn: 'root' })
export class StoreNotesService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);

  /** False until the first snapshot arrives — drives skeleton vs. empty state. */
  readonly loaded = signal(false);

  readonly stores: Signal<StoreNote[]> = toSignal(
    this.auth.currentUser$.pipe(
      tap(() => this.loaded.set(false)),
      switchMap((user) =>
        user
          ? (
              collectionData(query(this.col(user.uid), orderBy('name')), {
                idField: 'id',
              }) as Observable<StoreNote[]>
            ).pipe(
              tap(() => this.loaded.set(true)),
              catchError(() => {
                this.loaded.set(true);
                return of<StoreNote[]>([]);
              })
            )
          : of<StoreNote[]>([]).pipe(tap(() => this.loaded.set(true)))
      )
    ),
    { initialValue: [] as StoreNote[] }
  );

  selectById(id: string): Signal<StoreNote | undefined> {
    return computed(() => this.stores().find((s) => s.id === id));
  }

  async add(input: StoreInput): Promise<string> {
    const uid = this.requireUid();
    const ref = await addDoc(this.col(uid), {
      ...input,
      nameNormalized: normalizeBottleName(input.name),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  }

  async update(id: string, input: StoreInput): Promise<void> {
    const uid = this.requireUid();
    await updateDoc(this.docRef(uid, id), {
      ...input,
      nameNormalized: normalizeBottleName(input.name),
      updatedAt: serverTimestamp(),
    });
  }

  async remove(id: string): Promise<void> {
    const uid = this.requireUid();
    await deleteDoc(this.docRef(uid, id));
  }

  private col(uid: string) {
    return collection(this.firestore, `users/${uid}/stores`);
  }

  private docRef(uid: string, id: string) {
    return doc(this.firestore, `users/${uid}/stores/${id}`);
  }

  private requireUid(): string {
    const uid = this.auth.snapshotUser?.uid;
    if (!uid) {
      throw new Error('Not signed in.');
    }
    return uid;
  }
}
