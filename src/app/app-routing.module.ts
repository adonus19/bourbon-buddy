import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

import { authGuard, publicOnlyGuard } from './core/guards/auth.guard';

const routes: Routes = [
  {
    path: '',
    redirectTo: 'tabs',
    pathMatch: 'full',
  },
  {
    path: 'login',
    canActivate: [publicOnlyGuard],
    loadChildren: () =>
      import('./features/auth/login/login.module').then((m) => m.LoginPageModule),
  },
  {
    path: 'register',
    canActivate: [publicOnlyGuard],
    loadChildren: () =>
      import('./features/auth/register/register.module').then(
        (m) => m.RegisterPageModule
      ),
  },
  {
    path: 'forgot-password',
    canActivate: [publicOnlyGuard],
    loadChildren: () =>
      import('./features/auth/forgot-password/forgot-password.module').then(
        (m) => m.ForgotPasswordPageModule
      ),
  },
  {
    path: 'tabs',
    canActivate: [authGuard],
    loadChildren: () =>
      import('./features/tabs/tabs.module').then((m) => m.TabsPageModule),
  },
  {
    path: '**',
    redirectTo: 'tabs',
  },
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules }),
  ],
  exports: [RouterModule],
})
export class AppRoutingModule {}
