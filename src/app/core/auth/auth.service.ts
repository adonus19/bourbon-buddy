import { Injectable, inject } from '@angular/core';
import {
  Auth,
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
import { Observable, firstValueFrom } from 'rxjs';
import { map } from 'rxjs/operators';

import { UserService } from '../services/user.service';

/**
 * Wraps AngularFire Auth. Exposes the reactive auth state and the auth
 * operations the app needs, and guarantees a Firestore /users/{uid} profile
 * document exists after any successful sign-in.
 *
 * Apple and Facebook providers are planned (BB-002) but those providers are
 * not yet enabled in Firebase, so only Email/Password and Google are wired.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(Auth);
  private readonly userService = inject(UserService);

  /** Emits the Firebase user, or null when signed out. */
  readonly currentUser$: Observable<User | null> = authState(this.auth);

  /** Convenience boolean stream for guards/UI. */
  readonly isAuthenticated$: Observable<boolean> = this.currentUser$.pipe(
    map((user) => !!user)
  );

  /** Snapshot of the current user (may be null before auth resolves). */
  get currentUser(): User | null {
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

  async signInWithGoogle(): Promise<User> {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(this.auth, provider);
    await this.userService.ensureProfile(cred.user);
    return cred.user;
  }

  async resetPassword(email: string): Promise<void> {
    await sendPasswordResetEmail(this.auth, email);
  }

  async signOut(): Promise<void> {
    await signOut(this.auth);
  }

  /** Resolves once on the first emitted auth state (used by guards). */
  waitForAuthInit(): Promise<User | null> {
    return firstValueFrom(this.currentUser$);
  }
}
