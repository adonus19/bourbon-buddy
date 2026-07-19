import { Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController } from '@ionic/angular';

import { StoreNote, StorePriceTier, StoreSpecialty } from '../../../models';
import {
  StoreInput,
  StoreNotesService,
} from '../../../core/services/store-notes.service';
import { PriceHistoryService } from '../../../core/services/price-history.service';
import {
  RecentStore,
  recentStores as pickRecentStores,
} from '../../../shared/utils/store-evidence';
import { matchStore } from '../../../shared/utils/store-identity';
import { normalizeBottleName } from '../../../shared/utils/normalize-name';

/** How many recent stores to offer as tap-to-fill suggestions. */
const RECENT_STORE_SUGGESTIONS = 6;

/**
 * Store note create/edit (BB-223) — dual-mode Reactive Form at `/stores/new`
 * and `/stores/:id/edit`, mirroring the Hunt List add/edit page. `priceTier` is
 * a manual judgment (never inferred). New-mode reads query params
 * (name/city/state/placeId) so the BB-225 sighting→store handoff can prefill it.
 */
@Component({
  selector: 'app-store-form',
  templateUrl: './store-form.page.html',
  styleUrls: ['./store-form.page.scss'],
  standalone: false,
})
export class StoreFormPage {
  private readonly fb = inject(FormBuilder);
  private readonly stores = inject(StoreNotesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastController);
  private readonly priceHistory = inject(PriceHistoryService);

  readonly editId = this.route.snapshot.paramMap.get('id');
  get isEditMode(): boolean {
    return !!this.editId;
  }

  saving = false;
  private patched = false;
  private placeId: string | null = null;

  readonly priceTiers: { value: StorePriceTier; label: string }[] = [
    { value: 'underpriced', label: 'Underpriced' },
    { value: 'fair', label: 'Fair' },
    { value: 'overpriced', label: 'Overpriced' },
  ];

  readonly specialtyOptions: { value: StoreSpecialty; label: string }[] = [
    { value: 'store-picks', label: 'Store Picks' },
    { value: 'allocated', label: 'Allocated Drops' },
    { value: 'barrel-picks', label: 'Barrel Picks' },
    { value: 'rare-finds', label: 'Rare Finds' },
  ];

  readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    city: [''],
    state: ['', [Validators.maxLength(40)]],
    priceTier: [null as StorePriceTier | null],
    specialties: [[] as StoreSpecialty[]],
    shipmentNotes: [''],
    notes: [''],
  });

  private readonly editStore = this.editId
    ? this.stores.selectById(this.editId)
    : null;

  constructor() {
    if (this.editStore) {
      effect(() => {
        const s = this.editStore?.();
        if (s && !this.patched) {
          this.patched = true;
          this.patchFromStore(s);
        }
      });
    } else {
      // New mode: prefill from query params (BB-225 handoff).
      const q = this.route.snapshot.queryParamMap;
      this.placeId = q.get('placeId');
      const name = q.get('name') ?? '';
      this.form.patchValue({
        name,
        city: q.get('city') ?? '',
        state: q.get('state') ?? '',
      });
      // Arriving without a name means the user is starting from scratch —
      // offer the places they've actually been instead of making them type.
      if (!name) {
        void this.loadRecentStores();
      }
    }
  }

  /**
   * Stores the user has logged a sighting at, newest-first (BB-225). One
   * bounded one-shot read on open, in an explicit method — never in a
   * `computed`/`effect` (Firebase call discipline).
   */
  readonly recentStores = signal<RecentStore[]>([]);

  private async loadRecentStores(): Promise<void> {
    try {
      const points = await this.priceHistory.recentOwnPoints();
      // Only places the user has no note for yet — suggesting one they've
      // already written up would just mint a duplicate location.
      const noted = this.stores.stores();
      const fresh = pickRecentStores(points, RECENT_STORE_SUGGESTIONS).filter(
        (s) =>
          !matchStore(noted, {
            placeId: null,
            nameNormalized: normalizeBottleName(s.name),
            city: s.city,
          })
      );
      this.recentStores.set(fresh);
    } catch {
      // Suggestions are a convenience — never block the form for them.
      this.recentStores.set([]);
    }
  }

  /** Tap a suggestion to fill the location fields. */
  useRecentStore(s: RecentStore): void {
    this.form.patchValue({
      name: s.name,
      city: s.city ?? '',
      state: s.state ?? '',
    });
    this.form.markAsDirty();
    this.recentStores.set([]); // picked — the list has done its job
  }

  private patchFromStore(s: StoreNote): void {
    this.placeId = s.placeId ?? null;
    this.form.patchValue({
      name: s.name,
      city: s.city ?? '',
      state: s.state ?? '',
      priceTier: s.priceTier ?? null,
      specialties: [...(s.specialties ?? [])],
      shipmentNotes: s.shipmentNotes ?? '',
      notes: s.notes ?? '',
    });
  }

  isSpecialtySelected(value: StoreSpecialty): boolean {
    return (this.form.controls.specialties.value ?? []).includes(value);
  }

  toggleSpecialty(value: StoreSpecialty): void {
    const current = this.form.controls.specialties.value ?? [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    this.form.controls.specialties.setValue(next);
    this.form.controls.specialties.markAsDirty();
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving = true;
    try {
      const v = this.form.getRawValue();
      const input: StoreInput = {
        name: (v.name ?? '').trim(),
        placeId: this.placeId,
        city: this.strOrNull(v.city),
        state: this.strOrNull(v.state),
        priceTier: (v.priceTier as StorePriceTier | null) ?? null,
        specialties: v.specialties ?? [],
        shipmentNotes: this.strOrNull(v.shipmentNotes),
        notes: this.strOrNull(v.notes),
      };

      if (this.editId) {
        await this.stores.update(this.editId, input);
        await this.presentToast('Store updated.');
      } else {
        await this.stores.add(input);
        await this.presentToast('Store saved.');
      }
      await this.router.navigateByUrl('/stores', { replaceUrl: true });
    } catch {
      await this.presentToast(
        "Couldn't save. Check your connection and try again."
      );
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
