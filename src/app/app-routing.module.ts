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
    path: 'settings',
    canActivate: [authGuard],
    loadChildren: () =>
      import('./features/settings/settings.module').then(
        (m) => m.SettingsPageModule
      ),
  },
  {
    path: 'entry/new',
    canActivate: [authGuard],
    loadChildren: () =>
      import('./features/log-entry/add-edit/add-edit-entry.module').then(
        (m) => m.AddEditEntryPageModule
      ),
  },
  {
    path: 'entry/:id/edit',
    canActivate: [authGuard],
    loadChildren: () =>
      import('./features/log-entry/add-edit/add-edit-entry.module').then(
        (m) => m.AddEditEntryPageModule
      ),
  },
  {
    path: 'entry/:id',
    canActivate: [authGuard],
    loadChildren: () =>
      import('./features/log-entry/detail/log-entry-detail.module').then(
        (m) => m.LogEntryDetailPageModule
      ),
  },
  {
    path: 'wishlist/new',
    canActivate: [authGuard],
    loadChildren: () =>
      import('./features/wishlist-entry/add-edit/add-edit-wishlist.module').then(
        (m) => m.AddEditWishlistPageModule
      ),
  },
  {
    path: 'spotted/new',
    canActivate: [authGuard],
    loadChildren: () =>
      import('./features/spotted-it/spotted-it.module').then(
        (m) => m.SpottedItPageModule
      ),
  },
  {
    path: 'wishlist/:id/edit',
    canActivate: [authGuard],
    loadChildren: () =>
      import('./features/wishlist-entry/add-edit/add-edit-wishlist.module').then(
        (m) => m.AddEditWishlistPageModule
      ),
  },
  {
    path: 'wishlist/:id',
    canActivate: [authGuard],
    loadChildren: () =>
      import('./features/wishlist-entry/detail/wishlist-detail.module').then(
        (m) => m.WishlistDetailPageModule
      ),
  },
  {
    path: 'feed-settings',
    canActivate: [authGuard],
    loadChildren: () =>
      import('./features/feed-settings/feed-settings.module').then(
        (m) => m.FeedSettingsPageModule
      ),
  },
  {
    path: 'notification-settings',
    canActivate: [authGuard],
    loadChildren: () =>
      import(
        './features/notification-settings/notification-settings.module'
      ).then((m) => m.NotificationSettingsPageModule),
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
