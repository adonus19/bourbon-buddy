import { TestBed } from '@angular/core/testing';
import { ChangeDetectorRef, signal } from '@angular/core';
import { Router } from '@angular/router';

jest.mock('@angular/fire/firestore', () => ({
  Firestore: class {},
  Timestamp: { now: jest.fn(), fromMillis: jest.fn() },
  collection: jest.fn(),
  collectionData: jest.fn(),
  doc: jest.fn(),
  docData: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  serverTimestamp: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  runTransaction: jest.fn(),
}));
jest.mock('@angular/fire/functions', () => ({
  Functions: class {},
  httpsCallable: jest.fn(),
}));
jest.mock('@angular/fire/auth', () => ({ Auth: class {} }));
jest.mock('@ionic/angular', () => ({
  ModalController: class {},
  ToastController: class {},
  AlertController: class {},
}));

import { UserProfile } from '../../models';
import { AuthService } from '../../core/auth/auth.service';
import { OnboardingService } from '../../core/onboarding/onboarding.service';
import { StatsService } from '../../core/services/stats.service';
import { UserService } from '../../core/services/user.service';
import { NumbersPage } from './numbers.page';

/**
 * BB-229a — the Total Spent tile's hide/reveal behaviour. The formatting and
 * masking rules live in `spend-privacy.spec.ts`; this covers the wiring that
 * pure functions can't: what persists, what doesn't, and what the tile shows.
 */
describe('NumbersPage — Discreet Total Spent (BB-229a)', () => {
  let page: NumbersPage;
  let users: { setSpendPrivacy: jest.Mock };
  let profile: ReturnType<typeof signal<Partial<UserProfile> | undefined>>;

  function setup(
    spendPrivacy?: Partial<UserProfile>['spendPrivacy'],
    uid: string | null = 'u1'
  ) {
    profile = signal<Partial<UserProfile> | undefined>(
      spendPrivacy ? { spendPrivacy } : {}
    );
    users = { setSpendPrivacy: jest.fn().mockResolvedValue(undefined) };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        NumbersPage,
        {
          provide: StatsService,
          useValue: {
            hasData: signal(true),
            summary: signal({ totalSpent: 1240, avgRating: 4.2 }),
            topDistilleries: signal([]),
            topFlavorTags: signal([]),
            tastePreference: signal(null),
          },
        },
        {
          provide: AuthService,
          useValue: { profile, snapshotUser: uid ? { uid } : null },
        },
        { provide: UserService, useValue: users },
        {
          provide: OnboardingService,
          useValue: { showTipOnce: jest.fn(), registerAnchor: jest.fn() },
        },
        { provide: ChangeDetectorRef, useValue: { markForCheck: jest.fn() } },
        { provide: Router, useValue: { navigate: jest.fn() } },
      ],
    });
    page = TestBed.inject(NumbersPage);
  }

  it('shows the real amount for a profile that never set the option', () => {
    setup();
    expect(page.spendHidden()).toBe(false);
    expect(page.spent()).toBe('$1,240');
    expect(page.spendActionLabel()).toBe('Hide total spent');
  });

  it('masks the amount when the stored setting says hidden', () => {
    setup({ hidden: true });
    expect(page.spendHidden()).toBe(true);
    expect(page.spent()).toBe('—');
    expect(page.spendActionLabel()).toBe('Show total spent');
  });

  it('persists hiding so it survives a reload', async () => {
    setup();
    await page.toggleSpendPrivacy();
    expect(users.setSpendPrivacy).toHaveBeenCalledWith('u1', { hidden: true });
  });

  it('reveals for this session only — it must not clear the stored setting', async () => {
    setup({ hidden: true });
    await page.toggleSpendPrivacy();

    // Visible now...
    expect(page.spendHidden()).toBe(false);
    expect(page.spent()).toBe('$1,240');
    // ...but nothing was written, so the next visit hides it again.
    expect(users.setSpendPrivacy).not.toHaveBeenCalled();
    expect(page.spendPrivacy().hidden).toBe(true);
  });

  it('re-hides cleanly after a session reveal', async () => {
    setup({ hidden: true });
    await page.toggleSpendPrivacy(); // reveal
    await page.toggleSpendPrivacy(); // hide again

    // Already stored as hidden, so this is a no-op write plus a reveal reset.
    expect(page.spendHidden()).toBe(true);
    expect(page.spent()).toBe('—');
  });

  it('does nothing when signed out rather than throwing', async () => {
    setup(undefined, null);
    await expect(page.toggleSpendPrivacy()).resolves.toBeUndefined();
    expect(users.setSpendPrivacy).not.toHaveBeenCalled();
  });
});
