import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import {
  ActionSheetController,
  AlertController,
  ToastController,
} from '@ionic/angular';
import { Auth, updateProfile } from '@angular/fire/auth';
import { Functions, httpsCallable } from '@angular/fire/functions';

import { SightingVisibility } from '../../models';
import { AuthService } from '../../core/auth/auth.service';
import { USERNAME_TAKEN, UserService } from '../../core/services/user.service';
import { ExportKind, ExportService } from '../../core/services/export.service';
import { NotificationService } from '../../core/services/notification.service';
import { InboxService } from '../../core/services/inbox.service';
import {
  USERNAME_MAX,
  USERNAME_MIN,
  validateUsername,
} from '../../shared/utils/username';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: false,
})
export class ProfilePage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly firebaseAuth = inject(Auth);
  private readonly userService = inject(UserService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastController);
  private readonly alertCtrl = inject(AlertController);
  private readonly actionSheet = inject(ActionSheetController);
  private readonly exportService = inject(ExportService);
  private readonly notifications = inject(NotificationService);
  private readonly inbox = inject(InboxService);
  private readonly functions = inject(Functions);

  /** Unread inbox count for the badge; refreshed on entering the page. */
  readonly inboxUnread = signal(0);
  readonly backfilling = signal(false);

  // Already-loaded signals from the session state holder — no new Firebase reads.
  readonly user = this.auth.currentUser;
  readonly profile = this.auth.profile;

  /** Only email/password users can change a password. */
  readonly hasPasswordProvider = computed(
    () =>
      this.user()?.providerData.some((p) => p.providerId === 'password') ?? false
  );

  readonly form = this.fb.group({
    displayName: ['', [Validators.required, Validators.maxLength(60)]],
    bio: ['', [Validators.maxLength(280)]],
    homeRegion: ['', [Validators.maxLength(80)]],
  });

  // Public handle is edited separately so claiming it doesn't entangle the
  // main profile form's dirty/pristine state.
  readonly usernameForm = this.fb.group({
    username: [
      '',
      [
        Validators.minLength(USERNAME_MIN),
        Validators.maxLength(USERNAME_MAX),
        Validators.pattern(/^[a-zA-Z0-9_]+$/),
      ],
    ],
  });

  readonly currentUsername = computed(() => this.profile()?.username ?? null);
  readonly isDiscoverable = computed(
    () => this.profile()?.isDiscoverable ?? false
  );
  readonly defaultVisibility = computed<SightingVisibility>(
    () => this.profile()?.defaultSightingVisibility ?? 'private'
  );

  saving = false;
  claimingUsername = false;

  constructor() {
    // Sync the loaded profile into the form, but never clobber in-progress edits.
    // (Valid effect use: syncing signal state into the imperative Forms API.)
    effect(() => {
      const p = this.profile();
      if (p && this.form.pristine) {
        this.form.patchValue(
          {
            displayName: p.displayName ?? '',
            bio: p.bio ?? '',
            homeRegion: p.homeRegion ?? '',
          },
          { emitEvent: false }
        );
      }
    });

    effect(() => {
      const p = this.profile();
      if (p && this.usernameForm.pristine) {
        this.usernameForm.patchValue(
          { username: p.username ?? '' },
          { emitEvent: false }
        );
      }
    });
  }

  async ionViewWillEnter(): Promise<void> {
    this.inboxUnread.set(await this.inbox.unreadCount());
  }

  /** Dev/test tool (BB-130): extract bottles for recent articles on demand. */
  async backfillBottles(): Promise<void> {
    if (this.backfilling()) {
      return;
    }
    this.backfilling.set(true);
    try {
      const call = httpsCallable<
        { limit: number },
        {
          scanned: number;
          processed: number;
          skipped: number;
          rateLimited?: boolean;
        }
      >(this.functions, 'backfillArticleBottles');
      const res = await call({ limit: 25 });
      const { scanned, processed, rateLimited } = res.data;
      await this.presentToast(
        rateLimited
          ? `Processed ${processed}, then hit the AI rate limit. Try again in a minute.`
          : `Scanned ${scanned}, processed ${processed}.`
      );
    } catch {
      await this.presentToast('Backfill failed — check the function logs.');
    } finally {
      this.backfilling.set(false);
    }
  }

  async claimUsername(): Promise<void> {
    const uid = this.user()?.uid;
    const desired = (this.usernameForm.value.username ?? '').trim();
    if (!uid || this.claimingUsername) {
      return;
    }
    const problem = validateUsername(desired);
    if (problem) {
      await this.presentToast(problem);
      return;
    }
    this.claimingUsername = true;
    try {
      await this.userService.claimUsername(uid, desired, this.currentUsername());
      this.usernameForm.markAsPristine();
      await this.presentToast(`Handle claimed: @${desired}`);
    } catch (err) {
      const msg =
        err instanceof Error && err.message === USERNAME_TAKEN
          ? 'That handle is taken. Try another.'
          : "Couldn't claim that handle. Try again.";
      await this.presentToast(msg);
    } finally {
      this.claimingUsername = false;
    }
  }

  async setDefaultVisibility(value: SightingVisibility): Promise<void> {
    const uid = this.user()?.uid;
    if (!uid || value === this.defaultVisibility()) {
      return;
    }
    try {
      await this.userService.setDefaultSightingVisibility(uid, value);
    } catch {
      await this.presentToast("Couldn't update. Try again.");
    }
  }

  async toggleDiscoverable(value: boolean): Promise<void> {
    const uid = this.user()?.uid;
    if (!uid || value === this.isDiscoverable()) {
      return;
    }
    try {
      await this.userService.setDiscoverable(uid, value);
    } catch {
      await this.presentToast("Couldn't update discoverability. Try again.");
    }
  }

  async save(): Promise<void> {
    const uid = this.user()?.uid;
    if (!uid || this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving = true;
    try {
      const displayName = this.form.value.displayName!.trim();
      await this.userService.updateProfile(uid, {
        displayName,
        bio: this.form.value.bio?.trim() || null,
        homeRegion: this.form.value.homeRegion?.trim() || null,
      });
      // Keep the Firebase Auth display name in sync with the profile doc.
      const authUser = this.firebaseAuth.currentUser;
      if (authUser && authUser.displayName !== displayName) {
        await updateProfile(authUser, { displayName });
      }
      this.form.markAsPristine();
      await this.presentToast('Saved.');
    } catch {
      await this.presentToast(
        "Couldn't save. Check your connection and try again."
      );
    } finally {
      this.saving = false;
    }
  }

  async onAvatarUploaded(url: string): Promise<void> {
    const uid = this.user()?.uid;
    if (!uid) {
      return;
    }
    await this.userService.updateProfile(uid, { avatarUrl: url });
    const authUser = this.firebaseAuth.currentUser;
    if (authUser) {
      await updateProfile(authUser, { photoURL: url });
    }
    await this.presentToast('Avatar updated.');
  }

  async changePassword(): Promise<void> {
    const email = this.user()?.email;
    if (!email) {
      return;
    }
    try {
      await this.auth.resetPassword(email);
      await this.presentToast('Password reset email sent.');
    } catch {
      await this.presentToast('Something went wrong. Try again.');
    }
  }

  async exportData(): Promise<void> {
    const sheet = await this.actionSheet.create({
      header: 'Export to CSV',
      buttons: [
        { text: 'Cellar & Hunt List', handler: () => void this.runExport('both') },
        { text: 'Cellar only', handler: () => void this.runExport('log') },
        {
          text: 'Hunt List only',
          handler: () => void this.runExport('wishlist'),
        },
        { text: 'Cancel', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  private async runExport(kind: ExportKind): Promise<void> {
    if (!this.exportService.hasData(kind)) {
      await this.presentToast('Nothing to export yet.');
      return;
    }
    try {
      await this.exportService.export(kind);
    } catch {
      await this.presentToast("Couldn't export. Try again.");
    }
  }

  async confirmSignOut(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Sign out?',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Sign out',
          role: 'destructive',
          handler: () => {
            void this.signOut();
          },
        },
      ],
    });
    await alert.present();
  }

  private async signOut(): Promise<void> {
    // Drop this device's push token before the session ends.
    await this.notifications.cleanupForSignOut();
    await this.auth.signOut();
    await this.presentToast('See you next pour.');
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  private async presentToast(message: string): Promise<void> {
    const t = await this.toast.create({
      message,
      duration: 2000,
      position: 'top',
    });
    await t.present();
  }
}
