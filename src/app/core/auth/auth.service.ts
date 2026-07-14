import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  Auth,
  GoogleAuthProvider,
  ParsedToken,
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
 * Gated access (BB-210/211): does this ID token grant entry? Mirrors the
 * `isApproved()` rules helper — the `approved` claim, or `admin` (so the owner
 * can never lock themself out).
 */
export function hasAccessClaims(claims: ParsedToken): boolean {
  return claims['approved'] === true || claims['admin'] === true;
}

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
 * Wired providers: Email/Password and Google (BB-002). Apple and Facebook were
 * both dropped — Apple needs a paid developer account and Facebook needs a
 * verified business, neither of which this single-user app has.
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
   * Whether the current ID token carries an access-granting claim (BB-211).
   * `undefined` = not resolved yet for the current user; `false` = signed out
   * or unapproved. Fed from the CACHED token (no network) on every auth-state
   * change; `refreshClaims()` is the explicit network path used when the
   * pending screen sees the profile flip to approved.
   */
  private readonly approvedClaimState = signal<boolean | undefined>(undefined);
  readonly approvedClaim = this.approvedClaimState.asReadonly();

  /**
   * Whether the current token carries `admin: true` (BB-212) — gates the
   * owner-tools Settings entry and the /admin route. Same cached-token
   * plumbing as approvedClaim.
   */
  private readonly adminClaimState = signal<boolean | undefined>(undefined);
  readonly adminClaim = this.adminClaimState.asReadonly();

  constructor() {
    // Piggybacks on the single shared auth stream — no extra Firebase
    // listener. getIdTokenResult() here reads the locally cached token.
    this.currentUser$.subscribe((user) => void this.resolveClaims(user));
  }

  private async resolveClaims(user: User | null): Promise<void> {
    if (!user) {
      this.approvedClaimState.set(false);
      this.adminClaimState.set(false);
      return;
    }
    const { claims } = await user.getIdTokenResult();
    this.approvedClaimState.set(hasAccessClaims(claims));
    this.adminClaimState.set(claims['admin'] === true);
  }

  /**
   * Force-refreshes the ID token so newly minted custom claims (approval just
   * granted) take effect without a re-login, and returns whether access is now
   * granted. Auth-only network call — nothing here touches Firestore.
   */
  async refreshClaims(): Promise<boolean> {
    const user = this.auth.currentUser;
    if (!user) {
      this.approvedClaimState.set(false);
      return false;
    }
    await user.getIdToken(true);
    const { claims } = await user.getIdTokenResult();
    const granted = hasAccessClaims(claims);
    this.approvedClaimState.set(granted);
    this.adminClaimState.set(claims['admin'] === true);
    return granted;
  }

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
