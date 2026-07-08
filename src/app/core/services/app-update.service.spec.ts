import { TestBed } from '@angular/core/testing';
import { SwUpdate } from '@angular/service-worker';
import { Subject } from 'rxjs';

jest.mock('@ionic/angular', () => ({ ToastController: class {} }));

import { ToastController } from '@ionic/angular';

import { AppUpdateService } from './app-update.service';

describe('AppUpdateService', () => {
  let versionUpdates: Subject<{ type: string }>;
  let swUpdate: { isEnabled: boolean; versionUpdates: Subject<{ type: string }> };
  let toastCreate: jest.Mock;
  let toastStub: {
    present: jest.Mock;
    onDidDismiss: jest.Mock;
  };

  function setup(enabled: boolean): AppUpdateService {
    versionUpdates = new Subject();
    swUpdate = { isEnabled: enabled, versionUpdates };
    toastStub = {
      present: jest.fn().mockResolvedValue(undefined),
      onDidDismiss: jest.fn().mockResolvedValue({ role: undefined }),
    };
    toastCreate = jest.fn().mockResolvedValue(toastStub);
    TestBed.configureTestingModule({
      providers: [
        AppUpdateService,
        { provide: SwUpdate, useValue: swUpdate },
        { provide: ToastController, useValue: { create: toastCreate } },
      ],
    });
    return TestBed.inject(AppUpdateService);
  }

  afterEach(() => {
    TestBed.resetTestingModule();
    jest.clearAllMocks();
  });

  it('does nothing when the service worker is disabled', () => {
    const service = setup(false);
    service.init();
    expect(versionUpdates.observed).toBe(false);
  });

  it('ignores update events other than VERSION_READY', () => {
    const service = setup(true);
    service.init();
    versionUpdates.next({ type: 'VERSION_DETECTED' });
    expect(toastCreate).not.toHaveBeenCalled();
  });

  it('offers a reload toast when a new version is ready', async () => {
    const service = setup(true);
    service.init();
    versionUpdates.next({ type: 'VERSION_READY' });
    await Promise.resolve(); // let the async toast chain start
    expect(toastCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        buttons: [expect.objectContaining({ role: 'reload' })],
      })
    );
  });

  it('reloads when the user taps Reload', async () => {
    const service = setup(true);
    const reloadSpy = jest
      .spyOn(
        service as unknown as { reloadPage: () => void },
        'reloadPage'
      )
      .mockImplementation(() => undefined);
    toastStub.onDidDismiss.mockResolvedValue({ role: 'reload' });
    service.init();
    versionUpdates.next({ type: 'VERSION_READY' });
    // drain the create → present → onDidDismiss promise chain
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(reloadSpy).toHaveBeenCalled();
  });

  it('does not reload when the toast times out', async () => {
    const service = setup(true);
    const reloadSpy = jest
      .spyOn(
        service as unknown as { reloadPage: () => void },
        'reloadPage'
      )
      .mockImplementation(() => undefined);
    service.init();
    versionUpdates.next({ type: 'VERSION_READY' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(toastStub.present).toHaveBeenCalled();
    expect(reloadSpy).not.toHaveBeenCalled();
  });
});
