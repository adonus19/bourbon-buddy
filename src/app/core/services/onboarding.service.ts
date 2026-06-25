import { Injectable } from '@angular/core';

/**
 * Tracks whether the one-time welcome screen has been shown. Backed by
 * localStorage (no Firebase — this is a per-device UI flag, not user data).
 */
@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private readonly key = 'bb_onboarding_seen_v1';

  hasSeenWelcome(): boolean {
    try {
      return localStorage.getItem(this.key) === 'true';
    } catch {
      // Private mode / storage disabled — don't trap the user on welcome.
      return true;
    }
  }

  markSeen(): void {
    try {
      localStorage.setItem(this.key, 'true');
    } catch {
      /* ignore */
    }
  }

  /** Where to land after a successful sign-in. */
  postAuthRoute(): string {
    return this.hasSeenWelcome() ? '/tabs' : '/welcome';
  }
}
