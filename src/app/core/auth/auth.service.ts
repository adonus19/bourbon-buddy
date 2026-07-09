import { Injectable, Signal, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  Auth,
  FacebookAuthProvider,
  GoogleAuthProvider,
  User,
  authState,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from '@angular/fire/auth';
import { Observable, firstValueFrom, of } from 'rxjs';
import { shareReplay, switchMap } from 'rxjs/operators';

import { UserProfile } from '../../models';
import { UserService } from '../services/user.service';

/**
 * Session state holder. Owns the auth state and the current user's profile,
 * and exposes them as signals so components consume already-fetched data
 * without opening their own Firebase listeners.
 *
 * Firebase listener budget (the whole app shares these):
 *   - exactly ONE auth-state listener (onAuthStateChanged), via `authState$`
 *   - exactly ONE Firestore profile listener at a time, swapped by switchMap
 *     when the signed-in user changes (closed entirely when signed out)
 *
 * IMPORTANT: never read Firestore inside a `computed()` or `effect()`. Derive
 * from these already-loaded signals instead — that keeps reads bounded.
 *
 * Wired providers: Email/Password, Google, and Facebook (BB-002). Each
 * federated provider must also be enabled in the Firebase console for its
 * popup to succeed. (Apple was dropped — it requires a paid developer account.)
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(Auth);
  private readonly userService = inject(UserService);

  /**
   * Single shared auth-state stream. `shareReplay({ refCount: false })` means
   * every consumer (signals, guards, the profile listener) attaches to ONE
   * underlying onAuthStateChanged listener rather than each creating its own.
   */
  readonly currentUser$: Observable<User | null> = authState(this.auth).pipe(
    shareReplay({ bufferSize: 1, refCount: false })
  );

  /** Current Firebase user as a signal. `undefined` = auth not resolved yet. */
  readonly currentUser: Signal<User | null | undefined> = toSignal(
    this.currentUser$,
    { initialValue: undefined }
  );

  readonly isAuthenticated = computed(() => !!this.currentUser());

  /**
   * The signed-in user's profile document, fed by the single shared auth
   * stream. switchMap closes the previous doc listener when the user changes.
   */
  readonly profile: Signal<UserProfile | undefined> = toSignal(
    this.currentUser$.pipe(
      switchMap((user) =>
        user ? this.userService.profileDoc$(user.uid) : of(undefined)
      )
    ),
    { initialValue: undefined }
  );

  /** Synchronous snapshot (may be null before auth resolves). */
  get snapshotUser(): User | null {
    return this.auth.currentUser;
  }

  async register(
    email: string,
    password: string,
    displayName: string
  ): Promise<User> {
    const cred = await createUserWithEmailAndPassword(this.auth, email, password);
    await updateProfile(cred.user, { displayName });
    await this.userService.ensureProfile(cred.user);
    return cred.user;
  }

  async signIn(email: string, password: string): Promise<User> {
    const cred = await signInWithEmailAndPassword(this.auth, email, password);
    await this.userService.ensureProfile(cred.user);
    return cred.user;
  }

  /**
   * Google sign-in via popup. We use popup (not signInWithRedirect) on purpose:
   * the redirect flow relies on cross-domain third-party storage to return the
   * credential from the firebaseapp.com auth handler to the app's domain, which
   * modern browsers (and incognito) block — leaving the user signed out. Popup
   * uses postMessage instead and is Firebase's current recommendation.
   */
  async signInWithGoogle(): Promise<User> {
    const cred = await signInWithPopup(this.auth, new GoogleAuthProvider());
    await this.userService.ensureProfile(cred.user);
    return cred.user;
  }

  /** Facebook sign-in via popup (same rationale as Google above). */
  async signInWithFacebook(): Promise<User> {
    const cred = await signInWithPopup(this.auth, new FacebookAuthProvider());
    await this.userService.ensureProfile(cred.user);
    return cred.user;
  }

  async resetPassword(email: string): Promise<void> {
    await sendPasswordResetEmail(this.auth, email);
  }

  async signOut(): Promise<void> {
    await signOut(this.auth);
  }

  /** Resolves on the first settled auth state (used by route guards). */
  waitForAuthInit(): Promise<User | null> {
    return firstValueFrom(this.currentUser$);
  }
}
