import { Injectable, inject } from '@angular/core';
import { ModalController } from '@ionic/angular';

import { ScannerModalComponent } from '../../shared/scanner/scanner-modal.component';

export interface BarcodeScanResult {
  /** Normalized digits (UPC/EAN). */
  code: string;
  /** How the code was obtained. */
  source: 'scan' | 'manual';
  /** Symbology, when the decoder reports one. */
  format?: string;
}

/**
 * Opens the camera scanner modal (BB-174) and returns the captured code.
 * The modal itself decodes via the native BarcodeDetector API where available,
 * falling back to @zxing/browser, and always offers manual entry — so callers
 * get a result on every platform. Resolves to null when the user cancels.
 *
 * NOTE: any feature that calls scan() must have `ScannerModule` in its module
 * graph so the modal component is compiled.
 */
@Injectable({ providedIn: 'root' })
export class BarcodeScannerService {
  private readonly modalCtrl = inject(ModalController);

  /** True when live camera scanning is plausible (secure context + camera API). */
  isCameraScanSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia &&
      (typeof window === 'undefined' || window.isSecureContext !== false)
    );
  }

  async scan(): Promise<BarcodeScanResult | null> {
    const modal = await this.modalCtrl.create({
      component: ScannerModalComponent,
      cssClass: 'scanner-modal',
    });
    await modal.present();
    const { data } = await modal.onWillDismiss<BarcodeScanResult | null>();
    return data ?? null;
  }
}
