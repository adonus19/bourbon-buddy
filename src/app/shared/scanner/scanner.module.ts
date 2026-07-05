import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';

import { ScannerModalComponent } from './scanner-modal.component';

/**
 * Provides the barcode scanner modal (BB-174). Import into any feature module
 * whose pages call `BarcodeScannerService.scan()`, so the modal component is
 * compiled into that lazy chunk (keeps @zxing/browser out of the main bundle).
 */
@NgModule({
  imports: [CommonModule, IonicModule],
  declarations: [ScannerModalComponent],
  exports: [ScannerModalComponent],
})
export class ScannerModule {}
