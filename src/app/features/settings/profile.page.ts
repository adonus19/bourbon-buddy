import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import {
  ActionSheetController,
  AlertController,
  ToastController,
} from '@ionic/angular';
import { Auth, updateProfile } from '@angular/fire/auth';

import { SightingVisibility } from '../../models';
import { AuthService } from '../../core/auth/auth.service';
import { USERNAME_TAKEN, UserService } from '../../core/services/user.service';
import { ExportKind, ExportService } from '../../core/services/export.service';
import { NotificationService } from '../../core/services/notification.service';
import { InboxService } from '../../core/services/inbox.service';
import { GeolocationService } from '../../core/services/geolocation.service';
import { OnboardingService } from '../../core/onboarding/onboarding.service';
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
  private readonly geo = inject(GeolocationService);
  private readonly onboarding = inject(OnboardingService);

  /** Unread inbox count for the badge; refreshed on entering the page. */
  readonly inboxUnread = signal(0);

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

  // Proximity alert prefs (BB-178).
  readonly DEFAULT_ALERT_RADIUS = 50;
  readonly radiusOptions = [10, 25, 50, 100, 250];
  readonly hasBaseLocation = computed(() => this.profile()?.baseLat != null);
  readonly baseLocationLabel = computed(
    () => this.profile()?.baseLocationLabel ?? null
  );
  readonly alertRadiusMiles = computed(
    () => this.profile()?.alertRadiusMiles ?? this.DEFAULT_ALERT_RADIUS
  );
  readonly locatingBase = signal(false);

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
      await this.presentToast(this.claimErrorMessage(err));
    } finally {
      this.claimingUsername = false;
    }
  }

  /**
   * Turns a claim failure into a message that names the actual cause instead of
   * a blanket "try again". The common real cause is a Firestore `permission-
   * denied`: the claim writes the public-profile projection, which the hardened
   * rules (BB-193) validate strictly, and an app that's been open (uncached) for
   * a while can be running client code that predates the current shape — so the
   * write is rejected for every handle, taken or not. Point that user at a
   * refresh rather than letting them retry handles forever.
   */
  private claimErrorMessage(err: unknown): string {
    if (err instanceof Error && err.message === USERNAME_TAKEN) {
      return 'That handle is taken. Try another.';
    }
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code: unknown }).code)
        : '';
    if (code === 'permission-denied') {
      return "Couldn't claim that handle — your app may be out of date. Reload the app, then try again.";
    }
    if (code === 'unavailable') {
      return "You appear to be offline. Check your connection and try again.";
    }
    return "Couldn't claim that handle. Try again.";
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

  /** Capture the user's current location as their alert base (BB-178). */
  async setBaseLocation(): Promise<void> {
    const uid = this.user()?.uid;
    if (!uid || this.locatingBase()) {
      return;
    }
    this.locatingBase.set(true);
    try {
      const coords = await this.geo.getCurrentPosition();
      if (!coords) {
        await this.presentToast("Couldn't get your location. Try again.");
        return;
      }
      const place = await this.geo.reverseGeocode(coords.lat, coords.lng);
      const label = place
        ? [place.city, place.state].filter(Boolean).join(', ') || null
        : null;
      await this.userService.setAlertLocation(
        uid,
        coords.lat,
        coords.lng,
        label
      );
      await this.presentToast('Base location set.');
    } catch {
      await this.presentToast("Couldn't save your location. Try again.");
    } finally {
      this.locatingBase.set(false);
    }
  }

  async clearBaseLocation(): Promise<void> {
    const uid = this.user()?.uid;
    if (!uid) {
      return;
    }
    try {
      await this.userService.clearAlertLocation(uid);
      await this.presentToast('Base location cleared.');
    } catch {
      await this.presentToast("Couldn't update. Try again.");
    }
  }

  async onRadiusChange(miles: number): Promise<void> {
    const uid = this.user()?.uid;
    if (!uid || miles === this.alertRadiusMiles()) {
      return;
    }
    try {
      await this.userService.setAlertRadiusMiles(uid, miles);
    } catch {
      await this.presentToast("Couldn't update alert radius. Try again.");
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

  /** Replay the guided walkthrough from the Cellar. */
  async takeTour(): Promise<void> {
    await this.router.navigateByUrl('/tabs/cellar');
    this.onboarding.startTour();
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
    this.inbox.clearAppBadge();
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
