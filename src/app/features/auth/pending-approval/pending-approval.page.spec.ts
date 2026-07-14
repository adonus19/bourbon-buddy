import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

jest.mock('@angular/fire/auth', () => ({ Auth: class {} }));
jest.mock('@angular/fire/firestore', () => ({ Firestore: class {} }));

import { UserProfile } from '../../../models';
import { AuthService } from '../../../core/auth/auth.service';
import { PendingApprovalPage } from './pending-approval.page';

describe('PendingApprovalPage — gated-access waiting room (BB-211)', () => {
  let profile: ReturnType<typeof signal<Partial<UserProfile> | undefined>>;
  let refreshClaims: jest.Mock;
  let authSignOut: jest.Mock;
  let navigateByUrl: jest.Mock;
  let fixture: ComponentFixture<PendingApprovalPage>;
  let page: PendingApprovalPage;

  function create(initial: Partial<UserProfile> | undefined): void {
    profile = signal<Partial<UserProfile> | undefined>(initial);
    refreshClaims = jest.fn().mockResolvedValue(true);
    authSignOut = jest.fn().mockResolvedValue(undefined);
    navigateByUrl = jest.fn().mockResolvedValue(true);

    TestBed.configureTestingModule({
      declarations: [PendingApprovalPage],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        {
          provide: AuthService,
          useValue: { profile, refreshClaims, signOut: authSignOut },
        },
        { provide: Router, useValue: { navigateByUrl } },
      ],
    });
    fixture = TestBed.createComponent(PendingApprovalPage);
    page = fixture.componentInstance;
    fixture.detectChanges();
  }

  afterEach(() => {
    TestBed.resetTestingModule();
    jest.clearAllMocks();
  });

  it("shows 'checking' before the profile has loaded", () => {
    create(undefined);
    expect(page.state()).toBe('checking');
  });

  it("shows 'checking' while the access trigger hasn't written a decision", () => {
    create({ displayName: 'New' }); // profile exists, no accessStatus yet
    expect(page.state()).toBe('checking');
  });

  it('shows the waiting copy for a pending account', () => {
    create({ accessStatus: 'pending' });
    expect(page.state()).toBe('pending');
    expect(refreshClaims).not.toHaveBeenCalled();
  });

  it('shows the denied copy for a denied account', () => {
    create({ accessStatus: 'denied' });
    expect(page.state()).toBe('denied');
    expect(refreshClaims).not.toHaveBeenCalled();
  });

  it('refreshes the token and enters the app when approval lands live', async () => {
    create({ accessStatus: 'pending' });
    expect(page.state()).toBe('pending');

    profile.set({ accessStatus: 'approved' });
    fixture.detectChanges(); // flush the effect
    await fixture.whenStable();

    expect(refreshClaims).toHaveBeenCalledTimes(1);
    expect(navigateByUrl).toHaveBeenCalledWith('/tabs', { replaceUrl: true });
  });

  it('stays put when the refreshed token still lacks the claim', async () => {
    create({ accessStatus: 'pending' });
    refreshClaims.mockResolvedValue(false);

    profile.set({ accessStatus: 'approved' });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(refreshClaims).toHaveBeenCalled();
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('signs out and returns to login', async () => {
    create({ accessStatus: 'pending' });
    await page.signOut();
    expect(authSignOut).toHaveBeenCalled();
    expect(navigateByUrl).toHaveBeenCalledWith('/login', { replaceUrl: true });
  });
});
