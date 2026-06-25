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
 * Reads/writes the Firestore /users/{uid} profile document.
 * Auth itself is owned by AuthService; this service only touches Firestore.
 */
@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly firestore = inject(Firestore);

  /** Live profile document for a user (null until it exists). */
  profile$(uid: string): Observable<UserProfile | undefined> {
    return docData(this.userDocRef(uid), { idField: 'id' }) as Observable<
      UserProfile | undefined
    >;
  }

  /**
   * Creates the /users/{uid} document on first sign-in if it doesn't exist.
   * Safe to call on every sign-in — it no-ops when the doc is already present.
   */
  async ensureProfile(user: User): Promise<void> {
    const ref = this.userDocRef(user.uid);
    const snapshot = await getDoc(ref);
    if (snapshot.exists()) {
      return;
    }
    await setDoc(ref, {
      displayName: user.displayName ?? user.email?.split('@')[0] ?? 'Bourbon Buddy',
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
