import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../auth/auth.service';

/**
 * Blocks unauthenticated access. Waits for the first auth-state emission so a
 * persisted session is recognized on cold start before redirecting to /login.
 */
export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const user = await firstValueFrom(auth.currentUser$);
  return user ? true : router.createUrlTree(['/login']);
};

/**
 * Reverse guard for auth pages (login/register/forgot): if already signed in,
 * bounce to the app instead of showing the login screen again.
 */
export const publicOnlyGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const user = await firstValueFrom(auth.currentUser$);
  return user ? router.createUrlTree(['/tabs']) : true;
};
