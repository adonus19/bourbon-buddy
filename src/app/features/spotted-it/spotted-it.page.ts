import { Component, inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { Timestamp } from '@angular/fire/firestore';

import { Bourbon, SightingVisibility } from '../../models';
import { AuthService } from '../../core/auth/auth.service';
import { BourbonCatalogService } from '../../core/services/bourbon-catalog.service';
import { SightingService } from '../../core/services/sighting.service';
import { BarcodeScannerService } from '../../core/services/barcode-scanner.service';
import { sightingErrorMessage } from '../../shared/utils/sighting-error';

/**
 * "Spotted it" — log a price sighting for ANY catalog bottle, whether or not
 * it's on your own Hunt List (BB-162). The payoff of decoupled sightings: you
 * can report a bottle you saw for a friend. The bottle is chosen via catalog
 * autocomplete (or created on the fly); the sighting is written to /sightings.
 */
@Component({
  selector: 'app-spotted-it',
  templateUrl: './spotted-it.page.html',
  styleUrls: ['./spotted-it.page.scss'],
  standalone: false,
})
export class SpottedItPage {
  private readonly fb = inject(FormBuilder);
  private readonly catalog = inject(BourbonCatalogService);
  private readonly sightings = inject(SightingService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastController);
  private readonly scanner = inject(BarcodeScannerService);

  saving = false;
  // BB-174: the raw captured code. BB-175 will resolve it to a catalog bottle.
  scannedCode: string | null = null;

  /** Open the camera scanner and capture a barcode. */
  async scanBarcode(): Promise<void> {
    const result = await this.scanner.scan();
    if (!result) {
      return;
    }
    this.scannedCode = result.code;
    // BB-175 will turn this code into a bottle lookup + prefill; for now,
    // confirm the capture so the flow is testable end-to-end.
    await this.presentToast(`Scanned barcode ${result.code}.`);
  }

  readonly form = this.fb.group({
    bourbonName: ['', [Validators.required, Validators.maxLength(120)]],
    bourbonId: [''],
    distillery: [''],
    storeName: ['', [Validators.required, Validators.maxLength(120)]],
    price: [null as number | null, [Validators.required]],
    sightingDate: [new Date().toISOString().slice(0, 10), [Validators.required]],
    city: [''],
    state: [''],
    notes: [''],
    visibility: [
      (this.auth.profile()?.defaultSightingVisibility ??
        'private') as SightingVisibility,
    ],
  });

  onNameInput(value: string): void {
    this.form.controls.bourbonName.setValue(value);
    this.form.controls.bourbonName.markAsDirty();
    // Typing after a pick means it's no longer a known catalog selection.
    this.form.controls.bourbonId.setValue('');
  }

  onBottleSelected(b: Bourbon): void {
    this.form.patchValue({
      bourbonName: b.name,
      bourbonId: b.id ?? '',
      distillery: b.distillery ?? '',
    });
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving = true;
    try {
      const v = this.form.getRawValue();
      const name = (v.bourbonName ?? '').trim();

      const bourbonId =
        v.bourbonId ||
        (await this.catalog.findOrCreate({
          name,
          distillery: this.strOrNull(v.distillery),
          bottler: null,
          category: null,
          subType: null,
          ageStatement: null,
          isNas: false,
          proof: null,
          series: null,
        }));

      await this.sightings.add(
        bourbonId,
        name,
        {
          storeName: (v.storeName ?? '').trim(),
          price: Number(v.price),
          sightingDate: Timestamp.fromDate(new Date(v.sightingDate as string)),
          city: this.strOrNull(v.city),
          state: this.strOrNull(v.state),
          notes: this.strOrNull(v.notes),
        },
        v.visibility === 'friends' ? 'friends' : 'private'
      );

      await this.presentToast('Spotted it. Sighting logged.');
      await this.router.navigateByUrl('/tabs/hunt-list', { replaceUrl: true });
    } catch (err) {
      await this.presentToast(sightingErrorMessage(err));
    } finally {
      this.saving = false;
    }
  }

  private strOrNull(v: string | null | undefined): string | null {
    const t = (v ?? '').trim();
    return t.length ? t : null;
  }

  private async presentToast(message: string): Promise<void> {
    const t = await this.toast.create({
      message,
      duration: 2000,
      position: 'top',
    });
    await t.present();
  }
}
