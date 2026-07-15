import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';

jest.mock('@ionic/angular', () => ({
  ToastController: class {},
  AlertController: class {},
  ActionSheetController: class {},
  ModalController: class {},
  LoadingController: class {},
}));
jest.mock('@angular/fire/firestore', () => ({
  Firestore: class {},
  Timestamp: { fromDate: jest.fn(() => ({ seconds: 0 })), now: jest.fn() },
}));
jest.mock('@angular/fire/auth', () => ({ Auth: class {} }));
jest.mock('@angular/fire/storage', () => ({ Storage: class {} }));

import {
  ActionSheetController,
  AlertController,
  LoadingController,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { LogEntryDetailPage } from './log-entry-detail.page';
import { LogEntryService } from '../../../core/services/log-entry.service';
import { PourSessionService } from '../../../core/services/pour-session.service';
import { StorageService } from '../../../core/services/storage.service';
import { AuthService } from '../../../core/auth/auth.service';
import { OnboardingService } from '../../../core/onboarding/onboarding.service';

function configure(opts?: {
  router?: Partial<Router>;
  loadingCtrl?: { create: jest.Mock };
  modalCtrl?: { create: jest.Mock };
  pourService?: { sessionsFor: jest.Mock; add?: jest.Mock };
}) {
  const route = {
    snapshot: {
      paramMap: { get: () => 'e1' },
      parent: null,
    },
  };
  TestBed.configureTestingModule({
    declarations: [LogEntryDetailPage],
    schemas: [NO_ERRORS_SCHEMA],
    providers: [
      { provide: LogEntryService, useValue: { selectById: () => signal(null) } },
      {
        provide: PourSessionService,
        useValue: opts?.pourService ?? {
          sessionsFor: jest.fn().mockReturnValue(of([])),
        },
      },
      { provide: StorageService, useValue: {} },
      { provide: AuthService, useValue: { snapshotUser: { uid: 'u1' } } },
      { provide: OnboardingService, useValue: { showTipOnce: jest.fn() } },
      { provide: ActivatedRoute, useValue: route },
      {
        provide: Router,
        useValue: opts?.router ?? { navigate: jest.fn().mockResolvedValue(true) },
      },
      {
        provide: LoadingController,
        useValue:
          opts?.loadingCtrl ?? {
            create: jest.fn().mockResolvedValue({
              present: jest.fn(),
              dismiss: jest.fn(),
            }),
          },
      },
      {
        provide: ModalController,
        useValue: opts?.modalCtrl ?? { create: jest.fn() },
      },
      { provide: ActionSheetController, useValue: {} },
      { provide: AlertController, useValue: {} },
      {
        provide: ToastController,
        useValue: { create: async () => ({ present: async () => undefined }) },
      },
    ],
  });
  return TestBed.createComponent(LogEntryDetailPage).componentInstance;
}

describe('LogEntryDetailPage — edit navigation loader', () => {
  afterEach(() => jest.clearAllMocks());

  it('shows a loading overlay, navigates to the edit page, then dismisses', async () => {
    const overlay = { present: jest.fn(), dismiss: jest.fn() };
    const loadingCtrl = { create: jest.fn().mockResolvedValue(overlay) };
    const router = { navigate: jest.fn().mockResolvedValue(true) };
    const c = configure({ loadingCtrl, router });

    await c.goToEdit();

    expect(overlay.present).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/entry', 'e1', 'edit']);
    expect(overlay.dismiss).toHaveBeenCalled();
  });

  it('dismisses the overlay even when navigation fails', async () => {
    const overlay = { present: jest.fn(), dismiss: jest.fn() };
    const loadingCtrl = { create: jest.fn().mockResolvedValue(overlay) };
    const router = { navigate: jest.fn().mockRejectedValue(new Error('nav')) };
    const c = configure({ loadingCtrl, router });

    await expect(c.goToEdit()).rejects.toThrow('nav');
    expect(overlay.dismiss).toHaveBeenCalled();
  });
});

describe('LogEntryDetailPage — collapsible pours section', () => {
  afterEach(() => jest.clearAllMocks());

  it('starts collapsed and toggles open/closed', () => {
    const c = configure();

    expect(c.poursOpen()).toBe(false);
    c.togglePours();
    expect(c.poursOpen()).toBe(true);
    c.togglePours();
    expect(c.poursOpen()).toBe(false);
  });

  it('expands the section after a new dram is saved', async () => {
    const pourService = {
      sessionsFor: jest.fn().mockReturnValue(of([])),
      add: jest.fn().mockResolvedValue(undefined),
    };
    const modalCtrl = {
      create: jest.fn().mockResolvedValue({
        present: jest.fn(),
        onWillDismiss: jest.fn().mockResolvedValue({
          role: 'save',
          data: { pourDate: '2026-07-01', rating: 4 },
        }),
      }),
    };
    const c = configure({ modalCtrl, pourService });

    await c.openPourForm();

    expect(pourService.add).toHaveBeenCalled();
    expect(c.poursOpen()).toBe(true);
  });

  it('stays collapsed when the pour form is cancelled', async () => {
    const modalCtrl = {
      create: jest.fn().mockResolvedValue({
        present: jest.fn(),
        onWillDismiss: jest
          .fn()
          .mockResolvedValue({ role: 'cancel', data: undefined }),
      }),
    };
    const c = configure({ modalCtrl });

    await c.openPourForm();

    expect(c.poursOpen()).toBe(false);
  });
});
