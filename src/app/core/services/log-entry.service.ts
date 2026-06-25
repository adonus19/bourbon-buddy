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

import { LogEntry } from '../../models';
import { AuthService } from '../auth/auth.service';
import { computeValueScore } from '../../shared/utils/value-score';

/** Caller-supplied fields for a new entry; the service fills the rest. */
export type LogEntryInput = Omit<
  LogEntry,
  'id' | 'valueScore' | 'createdAt' | 'updatedAt'
>;

/**
 * State holder for the signed-in user's log entries.
 *
 * Firebase budget: ONE Firestore listener for the whole collection (swapped by
 * switchMap when the user changes, closed on sign-out). The list is exposed as
 * a signal; the Cellar list, detail page, and (later) stats all read from this
 * cached signal — no per-component listeners, no extra reads. Detail lookups
 * use `selectById`, which reads the already-loaded signal rather than fetching.
 */
@Injectable({ providedIn: 'root' })
export class LogEntryService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);

  /** All entries for the current user, newest first. */
  readonly entries: Signal<LogEntry[]> = toSignal(
    this.auth.currentUser$.pipe(
      switchMap((user) =>
        user
          ? (collectionData(
              query(this.entriesCol(user.uid), orderBy('entryDate', 'desc')),
              { idField: 'id' }
            ) as Observable<LogEntry[]>)
          : of<LogEntry[]>([])
      )
    ),
    { initialValue: [] as LogEntry[] }
  );

  readonly count = computed(() => this.entries().length);

  /** Reactive single-entry selector that reads from the cached list signal. */
  selectById(id: string): Signal<LogEntry | undefined> {
    return computed(() => this.entries().find((e) => e.id === id));
  }

  /** Creates a new log entry; returns its generated id. */
  async add(input: LogEntryInput): Promise<string> {
    const uid = this.requireUid();
    const valueScore = computeValueScore(input.rating, input.purchasePrice);
    const ref = await addDoc(this.entriesCol(uid), {
      ...input,
      valueScore,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  }

  /** Overwrites the editable fields of an entry and recomputes value score. */
  async update(id: string, input: LogEntryInput): Promise<void> {
    const uid = this.requireUid();
    const valueScore = computeValueScore(input.rating, input.purchasePrice);
    await updateDoc(this.entryDocRef(uid, id), {
      ...input,
      valueScore,
      updatedAt: serverTimestamp(),
    });
  }

  /** Sets (or clears) just the label photo URL — used by the photo flow. */
  async setLabelPhotoUrl(id: string, url: string | null): Promise<void> {
    const uid = this.requireUid();
    await updateDoc(this.entryDocRef(uid, id), {
      labelPhotoUrl: url,
      updatedAt: serverTimestamp(),
    });
  }

  async remove(id: string): Promise<void> {
    const uid = this.requireUid();
    await deleteDoc(this.entryDocRef(uid, id));
  }

  private entriesCol(uid: string) {
    return collection(this.firestore, `users/${uid}/logEntries`);
  }

  private entryDocRef(uid: string, id: string) {
    return doc(this.firestore, `users/${uid}/logEntries/${id}`);
  }

  private requireUid(): string {
    const uid = this.auth.snapshotUser?.uid;
    if (!uid) {
      throw new Error('Not signed in.');
    }
    return uid;
  }
}
