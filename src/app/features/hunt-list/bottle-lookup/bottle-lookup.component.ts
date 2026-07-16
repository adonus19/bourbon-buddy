import { Component, inject, signal } from '@angular/core';
import { ModalController, ToastController } from '@ionic/angular';

import { Bourbon } from '../../../models';
import { BourbonCatalogService } from '../../../core/services/bourbon-catalog.service';
import { BarcodeScannerService } from '../../../core/services/barcode-scanner.service';
import {
  BottlePreviewInput,
  BottlePreviewSheetComponent,
} from '../../../shared/components/bottle-preview-sheet/bottle-preview-sheet.component';

/**
 * Bottle lookup (BB-217): search the shared catalog from the Hunt List — the
 * in-store "what does this taste like?" check. Type-ahead (or barcode scan)
 * finds the bottle; a result opens the same preview sheet as the Dispatch feed
 * (flavor profile, similar bottles, add-to-hunt-list). Read-only on purpose:
 * an unknown bottle is reported as not-in-catalog, never created or enriched
 * from here — no guessed tasting notes.
 */
@Component({
  selector: 'app-bottle-lookup',
  templateUrl: './bottle-lookup.component.html',
  styleUrls: ['./bottle-lookup.component.scss'],
  standalone: false,
})
export class BottleLookupComponent {
  private readonly catalog = inject(BourbonCatalogService);
  private readonly scanner = inject(BarcodeScannerService);
  private readonly modalCtrl = inject(ModalController);
  private readonly toastCtrl = inject(ToastController);

  readonly lookingUp = signal(false);

  /** Open the shared preview sheet for a catalog result. */
  async openBottle(b: Bourbon): Promise<void> {
    const bottle: BottlePreviewInput = {
      name: b.name,
      bourbonId: b.id ?? null,
      distillery: b.distillery ?? null,
      category: b.category ?? null,
    };
    const sheet = await this.modalCtrl.create({
      component: BottlePreviewSheetComponent,
      componentProps: { bottle },
      breakpoints: [0, 0.65, 0.95],
      initialBreakpoint: 0.65,
      cssClass: 'glass-modal',
    });
    await sheet.present();
    // onDidDismiss (not onWillDismiss): the sheet must be fully gone before
    // modalCtrl.dismiss(), or that call targets the sheet instead of us.
    const { role } = await sheet.onDidDismiss();
    if (role === 'added') {
      // Bottle's on the hunt list — the lookup did its job, close it too.
      await this.modalCtrl.dismiss(null, 'added');
    }
  }

  /** Scan a barcode and look it up — read-only, no catalog writes (BB-217). */
  async scanBarcode(): Promise<void> {
    const result = await this.scanner.scan();
    if (!result) {
      return;
    }
    this.lookingUp.set(true);
    try {
      const match = await this.catalog.findByUpc(result.code);
      if (match) {
        await this.openBottle(match);
      } else {
        await this.presentToast(
          "That barcode's not in the catalog yet — try the name search."
        );
      }
    } finally {
      this.lookingUp.set(false);
    }
  }

  async close(): Promise<void> {
    await this.modalCtrl.dismiss(null, 'cancel');
  }

  private async presentToast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 2500 });
    await toast.present();
  }
}
