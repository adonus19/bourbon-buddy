import { Component, inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { Timestamp } from '@angular/fire/firestore';

import { Bourbon } from '../../models';
import { BourbonCatalogService } from '../../core/services/bourbon-catalog.service';
import { SightingService } from '../../core/services/sighting.service';

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
  private readonly router = inject(Router);
  private readonly toast = inject(ToastController);

  saving = false;

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

      await this.sightings.add(bourbonId, name, {
        storeName: (v.storeName ?? '').trim(),
        price: Number(v.price),
        sightingDate: Timestamp.fromDate(new Date(v.sightingDate as string)),
        city: this.strOrNull(v.city),
        state: this.strOrNull(v.state),
        notes: this.strOrNull(v.notes),
      });

      await this.presentToast('Spotted it. Sighting logged.');
      await this.router.navigateByUrl('/tabs/hunt-list', { replaceUrl: true });
    } catch {
      await this.presentToast("Couldn't log the sighting. Try again.");
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
