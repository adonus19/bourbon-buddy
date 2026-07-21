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

import { SightingVisibility, SpendPrivacy, UserProfile } from '../../models';
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
    const existing = snapshot.exists()
      ? (snapshot.data() as UserProfile)
      : undefined;

    let profile: UserProfile;
    if (existing?.createdAt) {
      profile = existing;
    } else {
      // Missing doc — or a doc without createdAt, which means the BB-210
      // access trigger won the signup race and wrote accessStatus first.
      // merge:true fills in the profile fields WITHOUT clobbering that status
      // (which rules forbid the owner from touching anyway).
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
      await setDoc(ref, created, { merge: true });
      profile = { ...existing, ...created } as unknown as UserProfile;
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

    const pubRef = this.publicDocRef(uid);
    await runTransaction(this.firestore, async (tx) => {
      const newRef = doc(this.firestore, `usernames/${lower}`);
      // All reads must precede all writes in a Firestore transaction.
      const newSnap = await tx.get(newRef);
      const pubSnap = await tx.get(pubRef);
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
      // Write the FULL public projection, not a partial merge. The hardened
      // rules (BB-193) validate the whole resulting doc — an exact key set and
      // per-field types — so a legacy/partial /publicProfiles doc (missing a
      // now-required field, or carrying an old one) would make a merge write
      // fail validation and break every claim. Re-emitting all allowed fields,
      // preserving existing values, self-heals such a doc. friendCount is
      // preserved (the friend callables maintain it), not reset.
      const pub = pubSnap.data() ?? {};
      const displayName =
        typeof pub['displayName'] === 'string' && pub['displayName']
          ? (pub['displayName'] as string)
          : 'Bourbon Buddy';
      tx.set(pubRef, {
        displayName,
        username: handle,
        usernameLower: lower,
        avatarUrl: pub['avatarUrl'] ?? null,
        homeRegion: pub['homeRegion'] ?? null,
        isDiscoverable:
          typeof pub['isDiscoverable'] === 'boolean'
            ? pub['isDiscoverable']
            : false,
        friendCount:
          typeof pub['friendCount'] === 'number' ? pub['friendCount'] : 0,
        updatedAt: serverTimestamp(),
      });
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

  /** Sets the opt-in base location for proximity alerts (BB-178). */
  async setAlertLocation(
    uid: string,
    lat: number,
    lng: number,
    label: string | null
  ): Promise<void> {
    await updateDoc(this.userDocRef(uid), {
      baseLat: lat,
      baseLng: lng,
      baseLocationLabel: label ?? null,
      updatedAt: serverTimestamp(),
    });
  }

  /** Clears the base location (BB-178); radius preference is left intact. */
  async clearAlertLocation(uid: string): Promise<void> {
    await updateDoc(this.userDocRef(uid), {
      baseLat: null,
      baseLng: null,
      baseLocationLabel: null,
      updatedAt: serverTimestamp(),
    });
  }

  /** Sets the max distance for proximity alerts, in miles (BB-178). */
  async setAlertRadiusMiles(uid: string, miles: number): Promise<void> {
    await updateDoc(this.userDocRef(uid), {
      alertRadiusMiles: miles,
      updatedAt: serverTimestamp(),
    });
  }

  /**
   * Updates the Discreet Total Spent setting (BB-229).
   *
   * Deliberately private-profile ONLY — this never touches `/publicProfiles`.
   * Whether someone hides their spend is nobody else's business, and the public
   * projection has no reason to carry it.
   *
   * Patch-merged with dot paths so a partial update (just `hidden`, just
   * `tier`) can't blow away the rest of the map.
   */
  async setSpendPrivacy(
    uid: string,
    patch: Partial<SpendPrivacy>
  ): Promise<void> {
    const update: Record<string, unknown> = { updatedAt: serverTimestamp() };
    for (const [key, value] of Object.entries(patch)) {
      update[`spendPrivacy.${key}`] = value;
    }
    await updateDoc(this.userDocRef(uid), update);
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
