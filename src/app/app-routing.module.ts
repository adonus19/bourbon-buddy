import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

import { authGuard, publicOnlyGuard } from './core/guards/auth.guard';
import {
  adminGuard,
  approvedGuard,
  pendingOnlyGuard,
} from './core/guards/approval.guard';

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
  // Gated access (BB-211): signed-in-but-unapproved accounts wait here.
  // Requires auth but NOT approval; approved users are bounced to /tabs.
  {
    path: 'pending-approval',
    canActivate: [pendingOnlyGuard],
    loadChildren: () =>
      import('./features/auth/pending-approval/pending-approval.module').then(
        (m) => m.PendingApprovalPageModule
      ),
  },
  // Owner tools (BB-212): approvals queue + signup allowlist. Admin claim only.
  {
    path: 'admin',
    canActivate: [authGuard, adminGuard],
    loadChildren: () =>
      import('./features/admin/admin.module').then((m) => m.AdminPageModule),
  },
  {
    path: 'settings',
    canActivate: [authGuard, approvedGuard],
    loadChildren: () =>
      import('./features/settings/settings.module').then(
        (m) => m.SettingsPageModule
      ),
  },
  {
    path: 'entry/new',
    canActivate: [authGuard, approvedGuard],
    loadChildren: () =>
      import('./features/log-entry/add-edit/add-edit-entry.module').then(
        (m) => m.AddEditEntryPageModule
      ),
  },
  {
    path: 'entry/:id/edit',
    canActivate: [authGuard, approvedGuard],
    loadChildren: () =>
      import('./features/log-entry/add-edit/add-edit-entry.module').then(
        (m) => m.AddEditEntryPageModule
      ),
  },
  {
    path: 'entry/:id',
    canActivate: [authGuard, approvedGuard],
    loadChildren: () =>
      import('./features/log-entry/detail/log-entry-detail.module').then(
        (m) => m.LogEntryDetailPageModule
      ),
  },
  {
    path: 'wishlist/new',
    canActivate: [authGuard, approvedGuard],
    loadChildren: () =>
      import('./features/wishlist-entry/add-edit/add-edit-wishlist.module').then(
        (m) => m.AddEditWishlistPageModule
      ),
  },
  {
    path: 'spotted/new',
    canActivate: [authGuard, approvedGuard],
    loadChildren: () =>
      import('./features/spotted-it/spotted-it.module').then(
        (m) => m.SpottedItPageModule
      ),
  },
  {
    path: 'sightings/map',
    canActivate: [authGuard, approvedGuard],
    loadChildren: () =>
      import('./features/sightings-map/sightings-map.module').then(
        (m) => m.SightingsMapPageModule
      ),
  },
  {
    path: 'wishlist/:id/edit',
    canActivate: [authGuard, approvedGuard],
    loadChildren: () =>
      import('./features/wishlist-entry/add-edit/add-edit-wishlist.module').then(
        (m) => m.AddEditWishlistPageModule
      ),
  },
  {
    path: 'wishlist/:id',
    canActivate: [authGuard, approvedGuard],
    loadChildren: () =>
      import('./features/wishlist-entry/detail/wishlist-detail.module').then(
        (m) => m.WishlistDetailPageModule
      ),
  },
  // Friends & feed now live under the Social tab; keep these paths as redirects
  // so notification deep-links (e.g. "/friends") still resolve.
  { path: 'friends', redirectTo: 'tabs/social/friends', pathMatch: 'full' },
  { path: 'friends-feed', redirectTo: 'tabs/social/feed', pathMatch: 'full' },
  {
    path: 'inbox',
    canActivate: [authGuard, approvedGuard],
    loadChildren: () =>
      import('./features/inbox/inbox.module').then((m) => m.InboxPageModule),
  },
  {
    path: 'u/:id',
    canActivate: [authGuard, approvedGuard],
    loadChildren: () =>
      import('./features/public-profile/public-profile.module').then(
        (m) => m.PublicProfilePageModule
      ),
  },
  {
    path: 'feed-settings',
    canActivate: [authGuard, approvedGuard],
    loadChildren: () =>
      import('./features/feed-settings/feed-settings.module').then(
        (m) => m.FeedSettingsPageModule
      ),
  },
  {
    path: 'notification-settings',
    canActivate: [authGuard, approvedGuard],
    loadChildren: () =>
      import(
        './features/notification-settings/notification-settings.module'
      ).then((m) => m.NotificationSettingsPageModule),
  },
  {
    path: 'tabs',
    canActivate: [authGuard, approvedGuard],
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
