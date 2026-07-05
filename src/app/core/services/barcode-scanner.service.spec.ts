// Ionic's Stencil ESM and the ZXing browser libs don't load under jsdom/jest;
// stub them — the logic under test only uses ModalController as a DI token.
jest.mock('@ionic/angular', () => ({ ModalController: class {} }));
jest.mock('@zxing/browser', () => ({ BrowserMultiFormatReader: class {} }));
jest.mock('@zxing/library', () => ({ BarcodeFormat: {}, DecodeHintType: {} }));

import { TestBed } from '@angular/core/testing';
import { ModalController } from '@ionic/angular';

import { BarcodeScannerService } from './barcode-scanner.service';

describe('BarcodeScannerService', () => {
  let service: BarcodeScannerService;
  let modal: { present: jest.Mock; onWillDismiss: jest.Mock };
  let modalCtrl: { create: jest.Mock };

  beforeEach(() => {
    modal = {
      present: jest.fn().mockResolvedValue(undefined),
      onWillDismiss: jest.fn(),
    };
    modalCtrl = { create: jest.fn().mockResolvedValue(modal) };
    TestBed.configureTestingModule({
      providers: [
        BarcodeScannerService,
        { provide: ModalController, useValue: modalCtrl },
      ],
    });
    service = TestBed.inject(BarcodeScannerService);
  });

  it('presents the scanner modal and returns the captured result', async () => {
    const result = { code: '012345678905', source: 'scan' as const };
    modal.onWillDismiss.mockResolvedValue({ data: result });

    const res = await service.scan();

    expect(modalCtrl.create).toHaveBeenCalledTimes(1);
    expect(modal.present).toHaveBeenCalledTimes(1);
    expect(res).toEqual(result);
  });

  it('returns null when the modal is dismissed without data', async () => {
    modal.onWillDismiss.mockResolvedValue({ data: undefined });
    expect(await service.scan()).toBeNull();
  });

  describe('isCameraScanSupported', () => {
    const original = Object.getOwnPropertyDescriptor(
      navigator,
      'mediaDevices'
    );

    afterEach(() => {
      if (original) {
        Object.defineProperty(navigator, 'mediaDevices', original);
      }
    });

    it('is false when the camera API is unavailable', () => {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: undefined,
        configurable: true,
      });
      expect(service.isCameraScanSupported()).toBe(false);
    });

    it('is true when getUserMedia exists in a secure context', () => {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: jest.fn() },
        configurable: true,
      });
      Object.defineProperty(window, 'isSecureContext', {
        value: true,
        configurable: true,
      });
      expect(service.isCameraScanSupported()).toBe(true);
    });
  });
});
