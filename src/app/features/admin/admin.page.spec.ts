import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';

jest.mock('@ionic/angular', () => ({ ToastController: class {} }));
jest.mock('@angular/fire/firestore', () => ({
  Firestore: class {},
  Timestamp: class {},
}));
jest.mock('@angular/fire/functions', () => ({
  Functions: class {},
  httpsCallable: jest.fn(),
}));

import { ToastController } from '@ionic/angular';
import { Timestamp } from '@angular/fire/firestore';
import { AdminPage } from './admin.page';
import { AdminAccessService } from '../../core/services/admin-access.service';
import { AllowlistEntry, UserProfile } from '../../models';

const pete = {
  id: 'u-pete',
  displayName: 'Pete',
  email: 'pete@example.com',
  createdAt: { toDate: () => new Date() } as unknown as Timestamp,
} as UserProfile;

const mike: AllowlistEntry = {
  id: 'mike@example.com',
  note: 'Mike from work',
  addedAt: {} as Timestamp,
};

describe('AdminPage — owner tools (BB-212)', () => {
  let page: AdminPage;
  let admin: {
    pendingUsers: jest.Mock;
    allowlist: jest.Mock;
    approve: jest.Mock;
    deny: jest.Mock;
    addToAllowlist: jest.Mock;
    removeFromAllowlist: jest.Mock;
  };

  beforeEach(() => {
    admin = {
      pendingUsers: jest.fn().mockResolvedValue([pete]),
      allowlist: jest.fn().mockResolvedValue([mike]),
      approve: jest.fn().mockResolvedValue(undefined),
      deny: jest.fn().mockResolvedValue(undefined),
      addToAllowlist: jest.fn().mockResolvedValue('new@example.com'),
      removeFromAllowlist: jest.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({
      imports: [ReactiveFormsModule],
      declarations: [AdminPage],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: AdminAccessService, useValue: admin },
        {
          provide: ToastController,
          useValue: {
            create: async () => ({ present: async () => undefined }),
          },
        },
      ],
    });
    page = TestBed.createComponent(AdminPage).componentInstance;
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    jest.clearAllMocks();
  });

  it('loads the queue and allowlist on view enter', async () => {
    page.ionViewWillEnter();
    await Promise.resolve(); // flush reload
    await Promise.resolve();
    expect(page.pending()).toEqual([pete]);
    expect(page.entries()).toEqual([mike]);
  });

  it('approve calls the callable, drops the row, and re-reads the allowlist', async () => {
    await page.reload();
    await page.approve(pete);
    expect(admin.approve).toHaveBeenCalledWith('u-pete');
    expect(page.pending()).toEqual([]);
    expect(admin.allowlist).toHaveBeenCalledTimes(2); // initial + after approve
  });

  it('deny calls the callable and drops the row', async () => {
    await page.reload();
    await page.deny(pete);
    expect(admin.deny).toHaveBeenCalledWith('u-pete');
    expect(page.pending()).toEqual([]);
  });

  it('keeps the row when the callable fails', async () => {
    await page.reload();
    admin.approve.mockRejectedValue(new Error('nope'));
    await page.approve(pete);
    expect(page.pending()).toEqual([pete]);
  });

  it('adds a trimmed, lowercased email with its note', async () => {
    await page.reload();
    page.form.setValue({ email: '  New@Example.COM ', note: ' The new guy ' });
    await page.addEmail();
    expect(admin.addToAllowlist).toHaveBeenCalledWith(
      '  New@Example.COM ',
      'The new guy'
    );
    expect(admin.allowlist).toHaveBeenCalledTimes(2);
  });

  it('rejects an invalid email without calling the service', async () => {
    page.form.setValue({ email: 'not-an-email', note: '' });
    await page.addEmail();
    expect(admin.addToAllowlist).not.toHaveBeenCalled();
  });

  it('dedupes against the loaded allowlist (case-insensitive)', async () => {
    await page.reload();
    page.form.setValue({ email: 'MIKE@example.com', note: '' });
    await page.addEmail();
    expect(admin.addToAllowlist).not.toHaveBeenCalled();
  });

  it('removes an allowlist entry', async () => {
    await page.reload();
    await page.remove(mike);
    expect(admin.removeFromAllowlist).toHaveBeenCalledWith('mike@example.com');
    expect(page.entries()).toEqual([]);
  });
});
