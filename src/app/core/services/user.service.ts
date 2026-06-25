import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  doc,
  docData,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from '@angular/fire/firestore';
import { User } from '@angular/fire/auth';
import { Observable } from 'rxjs';

import { UserProfile } from '../../models';

/**
 * Low-level Firestore access for the /users/{uid} profile document.
 *
 * This service is deliberately stateless and does NOT depend on AuthService —
 * the single shared profile *listener* and cached signal live in AuthService
 * (the session state holder), which keeps Firestore reads to one open listener
 * for the whole app. Components must never call these methods directly to read
 * the current profile; read `AuthService.profile()` instead.
 */
@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly firestore = inject(Firestore);

  /** Raw realtime stream for a profile doc. Subscribe to this in ONE place. */
  profileDoc$(uid: string): Observable<UserProfile | undefined> {
    return docData(this.userDocRef(uid), { idField: 'id' }) as Observable<
      UserProfile | undefined
    >;
  }

  /**
   * Creates the /users/{uid} document on first sign-in if it doesn't exist.
   * One getDoc read per sign-in; no-ops when the doc is already present.
   */
  async ensureProfile(user: User): Promise<void> {
    const ref = this.userDocRef(user.uid);
    const snapshot = await getDoc(ref);
    if (snapshot.exists()) {
      return;
    }
    await setDoc(ref, {
      displayName:
        user.displayName ?? user.email?.split('@')[0] ?? 'Bourbon Buddy',
      email: user.email ?? '',
      avatarUrl: user.photoURL ?? null,
      bio: null,
      homeRegion: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  /** Updates editable profile fields and bumps updatedAt. */
  async updateProfile(
    uid: string,
    changes: Partial<
      Pick<UserProfile, 'displayName' | 'bio' | 'homeRegion' | 'avatarUrl'>
    >
  ): Promise<void> {
    await updateDoc(this.userDocRef(uid), {
      ...changes,
      updatedAt: serverTimestamp(),
    });
  }

  private userDocRef(uid: string) {
    return doc(this.firestore, `users/${uid}`);
  }
}
