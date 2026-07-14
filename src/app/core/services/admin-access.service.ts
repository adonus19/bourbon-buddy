import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';

import { AllowlistEntry, UserProfile } from '../../models';

/**
 * Owner tools for gated access (BB-212). Everything here is admin-claim-only:
 * rules deny these reads/writes to anyone else, and the callables run
 * requireAdmin server-side — the guard on /admin is just the UX layer.
 *
 * Cost discipline: the admin screen uses one-shot getDocs on view-enter (plus
 * explicit refresh), never standing listeners — approvals are rare events.
 */
@Injectable({ providedIn: 'root' })
export class AdminAccessService {
  private readonly firestore = inject(Firestore);
  private readonly functions = inject(Functions);

  /** One-shot list of accounts waiting for a decision. */
  async pendingUsers(): Promise<UserProfile[]> {
    const snap = await getDocs(
      query(
        collection(this.firestore, 'users'),
        where('accessStatus', '==', 'pending')
      )
    );
    return snap.docs.map(
      (d) => ({ id: d.id, ...d.data() }) as UserProfile
    );
  }

  /** Approve via the guarded callable (claim + status + allowlist upsert). */
  async approve(uid: string): Promise<void> {
    const callable = httpsCallable<{ uid: string }, { status: string }>(
      this.functions,
      'approveUser'
    );
    await callable({ uid });
  }

  /** Soft-deny via the guarded callable (status only; reversible). */
  async deny(uid: string): Promise<void> {
    const callable = httpsCallable<{ uid: string }, { status: string }>(
      this.functions,
      'denyUser'
    );
    await callable({ uid });
  }

  /** One-shot allowlist, newest first. */
  async allowlist(): Promise<AllowlistEntry[]> {
    const snap = await getDocs(
      query(
        collection(this.firestore, 'accessAllowlist'),
        orderBy('addedAt', 'desc')
      )
    );
    return snap.docs.map(
      (d) => ({ id: d.id, ...d.data() }) as AllowlistEntry
    );
  }

  /**
   * Adds an email to the allowlist. The lowercased email IS the doc ID, so
   * writes are naturally idempotent; callers should still pre-check for
   * duplicates to give honest feedback instead of silently re-stamping.
   * Returns the normalized key.
   */
  async addToAllowlist(email: string, note: string | null): Promise<string> {
    const key = email.trim().toLowerCase();
    await setDoc(doc(this.firestore, `accessAllowlist/${key}`), {
      note,
      addedAt: serverTimestamp(),
    });
    return key;
  }

  /** Removes an allowlist entry (future signups with it go to the queue). */
  async removeFromAllowlist(emailLower: string): Promise<void> {
    await deleteDoc(doc(this.firestore, `accessAllowlist/${emailLower}`));
  }
}
