import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  doc,
  docData,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from '@angular/fire/firestore';
import { User } from '@angular/fire/auth';
import { Observable } from 'rxjs';

import { SightingVisibility, UserProfile } from '../../models';
import { usernameKey } from '../../shared/utils/username';

/** Thrown by `claimUsername` when the desired handle is already reserved. */
export const USERNAME_TAKEN = 'USERNAME_TAKEN';

/**
 * Low-level Firestore access for the /users/{uid} profile document and its
 * public projection at /publicProfiles/{uid}.
 *
 * This service is deliberately stateless and does NOT depend on AuthService —
 * the single shared profile *listener* and cached signal live in AuthService
 * (the session state holder), which keeps Firestore reads to one open listener
 * for the whole app. Components must never call these methods directly to read
 * the current profile; read `AuthService.profile()` instead.
 *
 * The public projection (BB-100) exists because Firestore rules can't return a
 * subset of a document: to let other signed-in users see only a user's public
 * fields, those fields are mirrored into /publicProfiles/{uid}. Writes here keep
 * the two in sync; profile edits are rare, so the extra write is negligible.
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
   * Creates the /users/{uid} document on first sign-in if it doesn't exist, and
   * ensures the /publicProfiles/{uid} projection exists (covers accounts created
   * before BB-100). One getDoc per concern; no-ops when already present.
   */
  async ensureProfile(user: User): Promise<void> {
    const ref = this.userDocRef(user.uid);
    const snapshot = await getDoc(ref);

    let profile: UserProfile;
    if (snapshot.exists()) {
      profile = snapshot.data() as UserProfile;
    } else {
      const created = {
        displayName:
          user.displayName ?? user.email?.split('@')[0] ?? 'Bourbon Buddy',
        email: user.email ?? '',
        avatarUrl: user.photoURL ?? null,
        bio: null,
        homeRegion: null,
        username: null,
        isDiscoverable: false,
        friendCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(ref, created);
      profile = created as unknown as UserProfile;
    }

    const pubRef = this.publicDocRef(user.uid);
    const pubSnap = await getDoc(pubRef);
    if (!pubSnap.exists()) {
      await setDoc(pubRef, {
        displayName: profile.displayName,
        username: profile.username ?? null,
        usernameLower: profile.username ? usernameKey(profile.username) : null,
        avatarUrl: profile.avatarUrl ?? null,
        homeRegion: profile.homeRegion ?? null,
        isDiscoverable: profile.isDiscoverable ?? false,
        friendCount: profile.friendCount ?? 0,
        updatedAt: serverTimestamp(),
      });
    }
  }

  /** Updates editable profile fields, bumps updatedAt, mirrors public fields. */
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

    // Mirror only the public-facing subset (bio is private, so excluded).
    const pub: Record<string, unknown> = {};
    if ('displayName' in changes) pub['displayName'] = changes.displayName;
    if ('avatarUrl' in changes) pub['avatarUrl'] = changes.avatarUrl ?? null;
    if ('homeRegion' in changes) pub['homeRegion'] = changes.homeRegion ?? null;
    if (Object.keys(pub).length) {
      pub['updatedAt'] = serverTimestamp();
      await setDoc(this.publicDocRef(uid), pub, { merge: true });
    }
  }

  /**
   * Claims (or changes to) a username. The `/usernames/{usernameLower}`
   * reservation enforces case-insensitive uniqueness; the whole thing runs in
   * one transaction so the old reservation is released, the new one taken, and
   * both profile docs updated atomically. Throws `USERNAME_TAKEN` if the handle
   * belongs to someone else.
   */
  async claimUsername(
    uid: string,
    desired: string,
    currentUsername: string | null
  ): Promise<void> {
    const handle = desired.trim();
    const lower = usernameKey(handle);
    const prevLower = currentUsername ? usernameKey(currentUsername) : null;
    if (prevLower === lower) {
      return; // no change
    }

    await runTransaction(this.firestore, async (tx) => {
      const newRef = doc(this.firestore, `usernames/${lower}`);
      const newSnap = await tx.get(newRef);
      if (newSnap.exists() && newSnap.get('uid') !== uid) {
        throw new Error(USERNAME_TAKEN);
      }
      if (prevLower) {
        tx.delete(doc(this.firestore, `usernames/${prevLower}`));
      }
      tx.set(newRef, { uid, createdAt: serverTimestamp() });
      tx.update(this.userDocRef(uid), {
        username: handle,
        updatedAt: serverTimestamp(),
      });
      tx.set(
        this.publicDocRef(uid),
        { username: handle, usernameLower: lower, updatedAt: serverTimestamp() },
        { merge: true }
      );
    });
  }

  /** Sets the user's default visibility for newly logged sightings (BB-110). */
  async setDefaultSightingVisibility(
    uid: string,
    value: SightingVisibility
  ): Promise<void> {
    await updateDoc(this.userDocRef(uid), {
      defaultSightingVisibility: value,
      updatedAt: serverTimestamp(),
    });
  }

  /** Flips the discoverable-by-username opt-in on both profile docs. */
  async setDiscoverable(uid: string, value: boolean): Promise<void> {
    await updateDoc(this.userDocRef(uid), {
      isDiscoverable: value,
      updatedAt: serverTimestamp(),
    });
    await setDoc(
      this.publicDocRef(uid),
      { isDiscoverable: value, updatedAt: serverTimestamp() },
      { merge: true }
    );
  }

  private userDocRef(uid: string) {
    return doc(this.firestore, `users/${uid}`);
  }
  private publicDocRef(uid: string) {
    return doc(this.firestore, `publicProfiles/${uid}`);
  }
}
