// Ionic's Stencil ESM and the ZXing browser libs don't load under jsdom/jest;
// stub them — these tests exercise only the manual-entry path.
jest.mock('@ionic/angular', () => ({ ModalController: class {} }));
jest.mock('@zxing/browser', () => ({ BrowserMultiFormatReader: class {} }));
jest.mock('@zxing/library', () => ({ BarcodeFormat: {}, DecodeHintType: {} }));

import { TestBed } from '@angular/core/testing';
import { ModalController } from '@ionic/angular';

import { ScannerModalComponent } from './scanner-modal.component';

describe('ScannerModalComponent (manual entry logic)', () => {
  let component: ScannerModalComponent;
  let modalCtrl: { dismiss: jest.Mock };

  beforeEach(() => {
    modalCtrl = { dismiss: jest.fn().mockResolvedValue(true) };
    TestBed.configureTestingModule({
      providers: [{ provide: ModalController, useValue: modalCtrl }],
    });
    component = TestBed.runInInjectionContext(
      () => new ScannerModalComponent()
    );
  });

  it('validates the manually typed code', () => {
    component.onManualInput('12');
    expect(component.manualValid()).toBe(false);

    component.onManualInput('0 12345 67890 5');
    expect(component.manualValid()).toBe(true);
  });

  it('dismisses with the normalized code on manual submit', () => {
    component.onManualInput('0-12345-67890-5');
    component.submitManual();

    expect(modalCtrl.dismiss).toHaveBeenCalledWith({
      code: '012345678905',
      source: 'manual',
      format: undefined,
    });
  });

  it('does not dismiss when the manual code is invalid', () => {
    component.onManualInput('42');
    component.submitManual();
    expect(modalCtrl.dismiss).not.toHaveBeenCalled();
  });

  it('cancel dismisses with null', () => {
    component.cancel();
    expect(modalCtrl.dismiss).toHaveBeenCalledWith(null);
  });

  it('ignores a second submit once finished (idempotent)', () => {
    component.cancel();
    modalCtrl.dismiss.mockClear();

    component.onManualInput('012345678905');
    component.submitManual();
    expect(modalCtrl.dismiss).not.toHaveBeenCalled();
  });

  it('maps camera start errors to a user-facing status', () => {
    const fail = (name: string) =>
      (
        component as unknown as { handleStartError(e: unknown): void }
      ).handleStartError({ name });

    fail('NotAllowedError');
    expect(component.status()).toBe('denied');
    fail('SecurityError');
    expect(component.status()).toBe('denied');
    fail('NotFoundError');
    expect(component.status()).toBe('unavailable');
    fail('OverconstrainedError');
    expect(component.status()).toBe('unavailable');
    fail('SomethingElse');
    expect(component.status()).toBe('error');
  });

  it('sets error status when there is no video element to attach to', async () => {
    await component.ngAfterViewInit();
    expect(component.status()).toBe('error');
  });

  it('toggleTorch is a no-op without a camera stream', async () => {
    await component.toggleTorch();
    expect(component.torchOn()).toBe(false);
  });

  it('tears down cleanly on destroy', () => {
    expect(() => component.ngOnDestroy()).not.toThrow();
  });

  it('waitForVideoDimensions resolves immediately when already sized', async () => {
    await (
      component as unknown as {
        waitForVideoDimensions(v: HTMLVideoElement): Promise<void>;
      }
    ).waitForVideoDimensions({ videoWidth: 640 } as HTMLVideoElement);
    // Contract: resolves without hanging when the video already has dimensions.
    expect(component.status()).toBe('starting');
  });

  it('takes the ZXing fallback path when BarcodeDetector is absent', async () => {
    (component as unknown as { videoRef: unknown }).videoRef = {
      nativeElement: document.createElement('video'),
    };
    // No BarcodeDetector in jsdom → startZxing runs; the stubbed reader has no
    // decodeFromVideoDevice, so it throws and we surface an error status.
    await component.ngAfterViewInit();
    expect(component.status()).toBe('error');
  });

  it('takes the native path when BarcodeDetector exists and maps denial', async () => {
    (globalThis as Record<string, unknown>)['BarcodeDetector'] = class {
      detect(): Promise<never[]> {
        return Promise.resolve([]);
      }
    };
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: jest
          .fn()
          .mockRejectedValue(
            Object.assign(new Error('no'), { name: 'NotAllowedError' })
          ),
      },
      configurable: true,
    });
    (component as unknown as { videoRef: unknown }).videoRef = {
      nativeElement: document.createElement('video'),
    };

    await component.ngAfterViewInit();
    expect(component.status()).toBe('denied');

    delete (globalThis as Record<string, unknown>)['BarcodeDetector'];
  });
});
