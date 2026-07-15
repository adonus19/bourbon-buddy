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
  Retailer,
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

  // Arriving from a bottle context (e.g. a wishlist detail's "Report a
  // Sighting"): the bottle comes prefilled and returnTo brings the user back
  // where they started instead of the Hunt List.
  private readonly returnTo = this.route.snapshot.queryParamMap.get('returnTo');

  constructor() {
    const bourbonName = this.route.snapshot.queryParamMap.get('bourbonName');
    if (bourbonName) {
      this.form.patchValue({
        bourbonName,
        bourbonId: this.route.snapshot.queryParamMap.get('bourbonId') ?? '',
      });
    }
  }

  // Opt-in location (BB-177). Captured when the user enables the toggle; passed
  // to the sighting on save. Coordinates are never shown as raw numbers.
  readonly attachLocation = signal(false);
  readonly locating = signal(false);
  private coords: Coordinates | null = null;

  // Nearby retailer picker (BB-187): populated from the captured coordinates.
  readonly nearbyStores = signal<Retailer[]>([]);
  readonly loadingStores = signal(false);
  readonly storesLoaded = signal(false); // a lookup has completed (drives empty state)

  // Presence attestation (BB-191): the store the user tapped in the picker.
  // Sent with the sighting so the server can verify the user was actually
  // there; save() drops it if the store name was hand-edited afterwards.
  readonly selectedStore = signal<Retailer | null>(null);

  async onToggleLocation(enabled: boolean): Promise<void> {
    if (!enabled) {
      this.attachLocation.set(false);
      this.coords = null;
      this.nearbyStores.set([]);
      this.storesLoaded.set(false);
      this.selectedStore.set(null);
      return;
    }
    this.locating.set(true);
    try {
      const coords = await this.geo.getCurrentPosition();
      if (coords) {
        this.coords = coords;
        this.attachLocation.set(true);
        // BB-183: fill City/State from the coords, non-blocking, never clobbering.
        void this.prefillCityState(coords);
        // BB-187: offer nearby stores to tap instead of typing.
        void this.loadNearbyStores(coords);
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

  /** Reverse-geocode coords into City/State, only filling blanks (BB-183). */
  private async prefillCityState(coords: Coordinates): Promise<void> {
    const place = await this.geo.reverseGeocode(coords.lat, coords.lng);
    if (!place) {
      return;
    }
    const city = this.form.controls.city;
    const state = this.form.controls.state;
    if (place.city && !(city.value ?? '').trim()) {
      city.setValue(place.city);
    }
    if (place.state && !(state.value ?? '').trim()) {
      state.setValue(place.state);
    }
  }

  /** Fetch tappable nearby stores for the captured coords (BB-187). */
  private async loadNearbyStores(coords: Coordinates): Promise<void> {
    this.storesLoaded.set(false);
    this.loadingStores.set(true);
    try {
      this.nearbyStores.set(
        await this.geo.nearbyRetailers(coords.lat, coords.lng)
      );
    } finally {
      this.loadingStores.set(false);
      this.storesLoaded.set(true);
    }
  }

  /** Tap a nearby store to fill the store name (and city/state when OSM has them). */
  selectStore(store: Retailer): void {
    this.selectedStore.set(store);
    const c = this.form.controls;
    c.storeName.setValue(store.name);
    c.storeName.markAsDirty();
    if (store.city) {
      c.city.setValue(store.city);
    }
    if (store.state) {
      c.state.setValue(store.state);
    }
  }

  /**
   * The picked store, but only while the form still matches it (BB-191). A
   * hand-edited store name means the user is reporting somewhere else, so the
   * pick — and with it the presence attestation — no longer applies.
   */
  private attestableStore(): Retailer | null {
    const picked = this.selectedStore();
    if (!picked || !this.attachLocation()) {
      return null;
    }
    const typed = (this.form.controls.storeName.value ?? '').trim();
    return typed === picked.name ? picked : null;
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

      const picked = this.attestableStore();
      const result = await this.sightings.add(
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
        this.attachLocation() ? this.coords : null,
        picked ? { id: picked.id ?? null, lat: picked.lat, lng: picked.lng } : null
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

      await this.presentToast(
        result === 'queued'
          ? "Saved offline — it'll sync when you're back online."
          : 'Spotted it. Sighting logged.'
      );
      await this.router.navigateByUrl(
        this.returnTo?.startsWith('/') ? this.returnTo : '/tabs/hunt-list',
        { replaceUrl: true }
      );
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
