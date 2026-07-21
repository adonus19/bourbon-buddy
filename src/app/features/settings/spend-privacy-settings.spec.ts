import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { Router } from '@angular/router';

jest.mock('@angular/fire/firestore', () => ({
  Firestore: class {},
  Timestamp: { now: jest.fn() },
  collection: jest.fn(),
  doc: jest.fn(),
  docData: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  serverTimestamp: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  runTransaction: jest.fn(),
}));
jest.mock('@angular/fire/functions', () => ({
  Functions: class {},
  httpsCallable: jest.fn(),
}));
jest.mock('@angular/fire/auth', () => ({
  Auth: class {},
  updatePassword: jest.fn(),
  reauthenticateWithCredential: jest.fn(),
  EmailAuthProvider: { credential: jest.fn() },
}));
jest.mock('@ionic/angular', () => ({
  ToastController: class {},
  AlertController: class {},
  ActionSheetController: class {},
}));

import { Auth } from '@angular/fire/auth';
import {
  ActionSheetController,
  AlertController,
  ToastController,
} from '@ionic/angular';

import { SpendPrivacy, UserProfile } from '../../models';
import { AuthService } from '../../core/auth/auth.service';
import { OnboardingService } from '../../core/onboarding/onboarding.service';
import { ExportService } from '../../core/services/export.service';
import { GeolocationService } from '../../core/services/geolocation.service';
import { InboxService } from '../../core/services/inbox.service';
import { NotificationService } from '../../core/services/notification.service';
import { UserService } from '../../core/services/user.service';
import { ProfilePage } from './profile.page';

/**
 * BB-229d — the Settings kill-switch for Discreet Total Spent.
 *
 * The gauntlet is a commitment device, not security. Being locked out of your
 * own spend by a joke you opted into is the one outcome this feature must never
 * produce, so this exit is unconditional in every mode.
 */
describe('ProfilePage — Discreet Total Spent settings (BB-229d)', () => {
  let page: ProfilePage;
  let users: { setSpendPrivacy: jest.Mock };
  let alertCtrl: { create: jest.Mock };

  /** Makes the next confirm dialog resolve with the given button role. */
  function answerConfirm(role: 'confirm' | 'cancel') {
    alertCtrl.create.mockResolvedValue({
      present: jest.fn().mockResolvedValue(undefined),
      onDidDismiss: jest.fn().mockResolvedValue({ role }),
    });
  }

  function setup(
    spendPrivacy?: Partial<SpendPrivacy>,
    uid: string | null = 'u1'
  ) {
    users = { setSpendPrivacy: jest.fn().mockResolvedValue(undefined) };
    alertCtrl = { create: jest.fn() };
    const profile = signal<Partial<UserProfile>>({ spendPrivacy });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        ProfilePage,
        FormBuilder,
        { provide: UserService, useValue: users },
        {
          provide: AuthService,
          useValue: { profile, currentUser: signal(uid ? { uid } : null) },
        },
        { provide: Auth, useValue: {} },
        { provide: Router, useValue: { navigate: jest.fn() } },
        {
          provide: ToastController,
          useValue: {
            create: jest
              .fn()
              .mockResolvedValue({ present: jest.fn().mockResolvedValue(null) }),
          },
        },
        { provide: AlertController, useValue: alertCtrl },
        { provide: ActionSheetController, useValue: { create: jest.fn() } },
        { provide: ExportService, useValue: {} },
        { provide: NotificationService, useValue: { permission: signal('default') } },
        { provide: InboxService, useValue: { unreadCount: jest.fn() } },
        { provide: GeolocationService, useValue: {} },
        {
          provide: OnboardingService,
          useValue: { showTipOnce: jest.fn(), registerAnchor: jest.fn(), resetAll: jest.fn() },
        },
      ],
    });
    page = TestBed.inject(ProfilePage);
  }

  it('reads an unset profile as not hidden', () => {
    setup();
    expect(page.spendPrivacy().hidden).toBe(false);
  });

  it('turns hiding off, clearing only `hidden`', async () => {
    setup({ hidden: true, mode: 'self', configured: true, gauntletRuns: 4 });
    answerConfirm('confirm');
    await page.setSpendHidden(false);

    // Mode and run count must survive: re-hiding later shouldn't re-ask who
    // you're hiding from.
    expect(users.setSpendPrivacy).toHaveBeenCalledWith('u1', { hidden: false });
  });

  it('exits from self mode without requiring the gauntlet', async () => {
    // Regression guard for the tempting "make self mode harder to escape"
    // idea — an unconditional exit is the point of this story.
    setup({ hidden: true, mode: 'self', configured: true });
    answerConfirm('confirm');
    await page.setSpendHidden(false);
    expect(users.setSpendPrivacy).toHaveBeenCalledWith('u1', { hidden: false });
  });

  it('ignores a no-op toggle rather than writing', async () => {
    setup({ hidden: true, mode: 'plain' });
    await page.setSpendHidden(true);
    expect(users.setSpendPrivacy).not.toHaveBeenCalled();
  });

  it('changes mode without touching whether it is hidden', async () => {
    setup({ hidden: true, mode: 'plain', configured: true });
    await page.setSpendMode('partner');

    const patch = users.setSpendPrivacy.mock.calls[0][1];
    expect(patch).toEqual({ mode: 'partner', configured: true });
    expect('hidden' in patch).toBe(false);
  });

  it('ignores selecting the mode already in effect', async () => {
    setup({ hidden: true, mode: 'partner' });
    await page.setSpendMode('partner');
    expect(users.setSpendPrivacy).not.toHaveBeenCalled();
  });

  it('surfaces a toast instead of throwing when the write fails', async () => {
    setup({ hidden: true });
    answerConfirm('confirm');
    users.setSpendPrivacy.mockRejectedValue(new Error('offline'));
    await expect(page.setSpendHidden(false)).resolves.toBeUndefined();
  });

  it('asks for confirmation before turning hiding off', async () => {
    setup({ hidden: true, mode: 'self' });
    answerConfirm('confirm');
    await page.setSpendHidden(false);

    expect(alertCtrl.create).toHaveBeenCalledTimes(1);
    const opts = alertCtrl.create.mock.calls[0][0];
    // Owns the loophole rather than pretending it isn't one.
    expect(opts.header).toMatch(/turn it off/i);
    expect(users.setSpendPrivacy).toHaveBeenCalledWith('u1', { hidden: false });
  });

  it('writes nothing and snaps the toggle back when the confirm is declined', async () => {
    setup({ hidden: true, mode: 'self' });
    answerConfirm('cancel');
    await page.setSpendHidden(false);

    expect(users.setSpendPrivacy).not.toHaveBeenCalled();
    // The switch must return to "hidden" — the DOM already moved on tap.
    expect(page.spendHiddenUi()).toBe(true);
  });

  it('does not ask for confirmation when turning hiding ON', async () => {
    // The joke is about escaping, not entering.
    setup({ hidden: false });
    await page.setSpendHidden(true);

    expect(alertCtrl.create).not.toHaveBeenCalled();
    expect(users.setSpendPrivacy).toHaveBeenCalledWith('u1', { hidden: true });
  });

  it('does nothing when signed out', async () => {
    setup({ hidden: true }, null);
    await page.setSpendHidden(false);
    expect(users.setSpendPrivacy).not.toHaveBeenCalled();
  });
});
