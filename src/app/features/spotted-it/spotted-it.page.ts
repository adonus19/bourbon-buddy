import { Component, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { Timestamp } from '@angular/fire/firestore';

import { Bourbon, SightingVisibility } from '../../models';
import { AuthService } from '../../core/auth/auth.service';
import { BourbonCatalogService } from '../../core/services/bourbon-catalog.service';
import { SightingService } from '../../core/services/sighting.service';
import { BarcodeScannerService } from '../../core/services/barcode-scanner.service';
import {
  Coordinates,
  GeolocationService,
} from '../../core/services/geolocation.service';
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
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastController);
  private readonly scanner = inject(BarcodeScannerService);
  private readonly geo = inject(GeolocationService);

  saving = false;
  private autoScanned = false;

  // Opt-in location (BB-177). Captured when the user enables the toggle; passed
  // to the sighting on save. Coordinates are never shown as raw numbers.
  readonly attachLocation = signal(false);
  readonly locating = signal(false);
  private coords: Coordinates | null = null;

  async onToggleLocation(enabled: boolean): Promise<void> {
    if (!enabled) {
      this.attachLocation.set(false);
      this.coords = null;
      return;
    }
    this.locating.set(true);
    try {
      const coords = await this.geo.getCurrentPosition();
      if (coords) {
        this.coords = coords;
        this.attachLocation.set(true);
      } else {
        this.coords = null;
        this.attachLocation.set(false);
        await this.presentToast(
          "Couldn't get your location. You can still log the sighting."
        );
      }
    } finally {
      this.locating.set(false);
    }
  }

  /** Deep-link fast path: /spotted/new?scan=1 (from the FAB) opens the camera. */
  ionViewDidEnter(): void {
    if (this.autoScanned) {
      return;
    }
    this.autoScanned = true;
    if (this.route.snapshot.queryParamMap.get('scan')) {
      void this.scanBarcode();
    }
  }
  // BB-175: a scanned code with no catalog match yet. Once the user names the
  // bottle and saves, we attach this code to that catalog entry for next time.
  private pendingUpc: string | null = null;
  // Non-blocking indicator while a scanned code is looked up in the catalog.
  readonly lookingUp = signal(false);

  /** Scan a barcode and resolve it to a catalog bottle (BB-174/BB-175). */
  async scanBarcode(): Promise<void> {
    const result = await this.scanner.scan();
    if (!result) {
      return;
    }
    this.lookingUp.set(true);
    try {
      const match = await this.catalog.findByUpc(result.code);
      if (match) {
        this.pendingUpc = null;
        this.onBottleSelected(match);
        await this.presentToast(`Matched ${match.name}.`);
      } else {
        this.pendingUpc = result.code;
        await this.presentToast(
          "New barcode — name the bottle and we'll remember it."
        );
      }
    } finally {
      this.lookingUp.set(false);
    }
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
        v.visibility === 'friends' ? 'friends' : 'private',
        this.attachLocation() ? this.coords : null
      );

      // Best-effort: teach the UPC index (BB-175). Never fail the sighting for it.
      if (this.pendingUpc) {
        try {
          await this.catalog.addUpc(bourbonId, this.pendingUpc);
        } catch {
          // index update is non-critical; the sighting already saved
        }
        this.pendingUpc = null;
      }

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
