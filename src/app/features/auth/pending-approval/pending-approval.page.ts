import { Component, computed, effect, inject } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';

type PendingState = 'checking' | 'pending' | 'denied';

/**
 * Gated-access waiting room (BB-211). A signed-in account without the
 * `approved` claim is parked here by approvedGuard.
 *
 * The page rides the ONE existing profile listener (AuthService.profile):
 *   - no accessStatus yet → "setting up" (covers the ~2s window where the
 *     access trigger hasn't written the decision, incl. allowlist auto-approve)
 *   - 'pending' / 'denied' → the matching copy
 *   - flips to 'approved' → swap the ID token for one carrying the new claim
 *     (refreshClaims) and enter the app — no re-login.
 */
@Component({
  selector: 'app-pending-approval',
  templateUrl: './pending-approval.page.html',
  styleUrls: ['./pending-approval.page.scss'],
  standalone: false,
})
export class PendingApprovalPage {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  private entering = false;

  readonly state = computed<PendingState>(() => {
    const status = this.authService.profile()?.accessStatus;
    if (status === 'pending') {
      return 'pending';
    }
    if (status === 'denied') {
      return 'denied';
    }
    // Profile not loaded yet, decision not written yet, or 'approved' while
    // the token refresh below is in flight — all render as "checking".
    return 'checking';
  });

  constructor() {
    // Side effect on approval (Auth token refresh + navigation — no Firestore
    // in effects per the cost rules; the claim fetch is an Auth call).
    effect(() => {
      if (this.authService.profile()?.accessStatus === 'approved') {
        void this.enterApp();
      }
    });
  }

  private async enterApp(): Promise<void> {
    if (this.entering) {
      return;
    }
    this.entering = true;
    try {
      // approveAccess mints the claim BEFORE it flips the status, so the
      // refreshed token is guaranteed to carry it by the time we see
      // 'approved'. The granted check is a belt-and-braces fallback.
      const granted = await this.authService.refreshClaims();
      if (granted) {
        await this.router.navigateByUrl('/tabs', { replaceUrl: true });
        return;
      }
    } finally {
      this.entering = false;
    }
  }

  async signOut(): Promise<void> {
    await this.authService.signOut();
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}
