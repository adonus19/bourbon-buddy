import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService, hasAccessClaims } from '../auth/auth.service';

/**
 * Gated access (BB-211). Chained AFTER authGuard on every protected route:
 * a signed-in account without the `approved` (or `admin`) claim is parked on
 * /pending-approval. Reads the locally cached ID token — zero network cost
 * for approved users. Rules enforce the real boundary; this is the UX mirror.
 */
export const approvedGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const user = await firstValueFrom(auth.currentUser$);
  if (!user) {
    return router.createUrlTree(['/login']);
  }
  const { claims } = await user.getIdTokenResult();
  return hasAccessClaims(claims)
    ? true
    : router.createUrlTree(['/pending-approval']);
};

/**
 * Reverse guard for the pending screen itself: requires a signed-in user
 * (signed out → login) and bounces already-approved accounts into the app.
 */
export const pendingOnlyGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const user = await firstValueFrom(auth.currentUser$);
  if (!user) {
    return router.createUrlTree(['/login']);
  }
  const { claims } = await user.getIdTokenResult();
  return hasAccessClaims(claims) ? router.createUrlTree(['/tabs']) : true;
};

/**
 * Owner tools (BB-212): the /admin route needs the `admin: true` claim.
 * Non-admins are quietly sent to the app rather than shown an error — the
 * entry point is hidden from them anyway, and rules deny the data regardless.
 */
export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const user = await firstValueFrom(auth.currentUser$);
  if (!user) {
    return router.createUrlTree(['/login']);
  }
  const { claims } = await user.getIdTokenResult();
  return claims['admin'] === true ? true : router.createUrlTree(['/tabs']);
};
