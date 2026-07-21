import { Injectable, inject } from '@angular/core';
import { Firestore, doc, getDoc, updateDoc } from '@angular/fire/firestore';

import { SharedItem, SharedItemStatus } from '../../models';
import { AuthService } from '../auth/auth.service';

/**
 * Items shared WITH the current user (BB-230). Reads live under the recipient's
 * own subcollection (`users/{uid}/sharedItems`), written cross-user only by the
 * `shareBottle`/`shareList` callables. BB-230c needs a single item (the receive
 * chooser, reached by the notification deep-link) and a status write; the
 * browsable "Shared with me" list is BB-230e.
 */
@Injectable({ providedIn: 'root' })
export class SharedItemsService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);

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
