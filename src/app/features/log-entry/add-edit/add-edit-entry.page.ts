import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { Timestamp } from '@angular/fire/firestore';

import {
  Bourbon,
  BourbonCategory,
  BourbonSubType,
  EntryType,
  FinishLength,
  WouldBuyAgain,
} from '../../../models';
import {
  LogEntryInput,
  LogEntryService,
} from '../../../core/services/log-entry.service';
import { BourbonCatalogService } from '../../../core/services/bourbon-catalog.service';

@Component({
  selector: 'app-add-edit-entry',
  templateUrl: './add-edit-entry.page.html',
  styleUrls: ['./add-edit-entry.page.scss'],
  standalone: false,
})
export class AddEditEntryPage {
  private readonly fb = inject(FormBuilder);
  private readonly logService = inject(LogEntryService);
  private readonly catalog = inject(BourbonCatalogService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastController);

  saving = false;

  readonly categories: { value: BourbonCategory; label: string }[] = [
    { value: 'bourbon', label: 'Bourbon' },
    { value: 'rye', label: 'Rye' },
    { value: 'wheat_whiskey', label: 'Wheat Whiskey' },
    { value: 'tennessee', label: 'Tennessee' },
    { value: 'american_other', label: 'Other American' },
    { value: 'scotch', label: 'Scotch' },
    { value: 'irish', label: 'Irish' },
    { value: 'japanese', label: 'Japanese' },
    { value: 'world_other', label: 'World Other' },
  ];

  readonly subTypes = [
    { value: 'single_barrel', label: 'Single Barrel' },
    { value: 'small_batch', label: 'Small Batch' },
    { value: 'blended', label: 'Blended' },
    { value: 'cask_strength', label: 'Cask Strength' },
    { value: 'nas', label: 'NAS' },
    { value: 'straight', label: 'Straight' },
    { value: 'bottled_in_bond', label: 'Bottled-in-Bond' },
  ];

  readonly entryTypes = [
    { value: 'drink', label: 'Tried as a drink' },
    { value: 'bottle_purchased', label: 'Purchased bottle' },
    { value: 'gift_received', label: 'Gift received' },
    { value: 'sample_split', label: 'Sample / split' },
    { value: 'virtual_tasting', label: 'Virtual tasting' },
  ];

  readonly bottleSizes = [50, 200, 375, 750, 1000, 1750];
  readonly remainingOptions = [
    { value: 100, label: 'Full' },
    { value: 75, label: 'Three-quarters' },
    { value: 50, label: 'Half' },
    { value: 25, label: 'One-quarter' },
    { value: 0, label: 'Empty' },
  ];

  readonly form = this.fb.group({
    // The Bottle
    bourbonName: ['', [Validators.required, Validators.maxLength(120)]],
    bourbonId: [''],
    distillery: [''],
    bottler: [''],
    category: ['bourbon' as BourbonCategory],
    subType: [null as string | null],
    // Bottle details
    ageStatement: [null as number | null],
    isNas: [false],
    proof: [null as number | null],
    mashBillCorn: [null as number | null],
    mashBillRye: [null as number | null],
    mashBillWheat: [null as number | null],
    mashBillMalt: [null as number | null],
    batchNumber: [''],
    barrelNumber: [''],
    series: [''],
    // How you got it
    entryType: ['drink'],
    didNotPurchase: [false],
    purchasePrice: [null as number | null],
    purchaseLocation: [''],
    purchaseDate: [null as string | null],
    bottleSizeMl: [null as number | null],
    bottleRemainingPct: [null as number | null],
    // What you thought
    rating: [null as number | null],
    noseTags: [[] as string[]],
    noseNotes: [''],
    palateTags: [[] as string[]],
    palateNotes: [''],
    finishTags: [[] as string[]],
    finishNotes: [''],
    finishLength: [null as string | null],
    wouldBuyAgain: [null as string | null],
    // Notes
    personalNotes: [''],
    entryDate: [new Date().toISOString().slice(0, 10)], // YYYY-MM-DD
  });

  // Reactive view of entryType so the template can show bottle-remaining only
  // for purchased bottles.
  private readonly entryTypeValue = signal(this.form.controls.entryType.value);
  readonly isPurchasedBottle = computed(
    () => this.entryTypeValue() === 'bottle_purchased'
  );

  constructor() {
    this.form.controls.entryType.valueChanges.subscribe((v) =>
      this.entryTypeValue.set(v)
    );
  }

  // --- Name autocomplete -------------------------------------------------
  onNameInput(value: string): void {
    this.form.controls.bourbonName.setValue(value);
    this.form.controls.bourbonName.markAsDirty();
    // Typing means we're no longer tied to a specific catalog doc.
    this.form.controls.bourbonId.setValue('');
  }

  onBottleSelected(b: Bourbon): void {
    this.form.patchValue({
      bourbonName: b.name,
      bourbonId: b.id ?? '',
      distillery: b.distillery ?? '',
      bottler: b.bottler ?? '',
      category: (b.category as BourbonCategory) ?? this.form.controls.category.value,
      subType: b.subType ?? null,
      ageStatement: b.ageStatement ?? null,
      isNas: b.isNas ?? false,
      proof: b.proof ?? null,
      series: b.series ?? '',
    });
  }

  // --- Mutually-exclusive / dependent fields -----------------------------
  onNasToggle(checked: boolean): void {
    const age = this.form.controls.ageStatement;
    if (checked) {
      age.setValue(null);
      age.disable();
    } else {
      age.enable();
    }
  }

  onAgeInput(): void {
    if (this.form.controls.ageStatement.value != null) {
      this.form.controls.isNas.setValue(false);
    }
  }

  onDidNotPurchaseToggle(checked: boolean): void {
    const { purchasePrice, purchaseLocation } = this.form.controls;
    if (checked) {
      purchasePrice.setValue(null);
      purchaseLocation.setValue('');
      purchasePrice.disable();
      purchaseLocation.disable();
    } else {
      purchasePrice.enable();
      purchaseLocation.enable();
    }
  }

  setRating(value: number): void {
    this.form.controls.rating.setValue(value);
    this.form.controls.rating.markAsDirty();
  }

  setTags(
    control: 'noseTags' | 'palateTags' | 'finishTags',
    tags: string[]
  ): void {
    this.form.controls[control].setValue(tags);
    this.form.controls[control].markAsDirty();
  }

  // --- Save --------------------------------------------------------------
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
          bottler: this.strOrNull(v.bottler),
          category: v.category ?? 'bourbon',
          subType: (v.subType as BourbonSubType | null) ?? null,
          ageStatement: this.numOrNull(v.ageStatement),
          isNas: v.isNas ?? false,
          proof: this.numOrNull(v.proof),
          series: this.strOrNull(v.series),
        }));

      const input: LogEntryInput = {
        bourbonId,
        bourbonName: name,
        distillery: this.strOrNull(v.distillery),
        bottler: this.strOrNull(v.bottler),
        category: v.category ?? 'bourbon',
        subType: (v.subType as BourbonSubType | null) ?? null,
        ageStatement: v.isNas ? null : this.numOrNull(v.ageStatement),
        isNas: v.isNas ?? false,
        proof: this.numOrNull(v.proof),
        mashBillCorn: this.numOrNull(v.mashBillCorn),
        mashBillRye: this.numOrNull(v.mashBillRye),
        mashBillWheat: this.numOrNull(v.mashBillWheat),
        mashBillMalt: this.numOrNull(v.mashBillMalt),
        batchNumber: this.strOrNull(v.batchNumber),
        barrelNumber: this.strOrNull(v.barrelNumber),
        series: this.strOrNull(v.series),
        entryType: (v.entryType as EntryType) ?? 'drink',
        didNotPurchase: v.didNotPurchase ?? false,
        purchasePrice: v.didNotPurchase ? null : this.numOrNull(v.purchasePrice),
        purchaseLocation: v.didNotPurchase
          ? null
          : this.strOrNull(v.purchaseLocation),
        purchaseDate: this.toTimestamp(v.purchaseDate),
        bottleSizeMl: this.numOrNull(v.bottleSizeMl),
        bottleRemainingPct: this.isPurchasedBottle()
          ? this.numOrNull(v.bottleRemainingPct)
          : null,
        rating: this.numOrNull(v.rating),
        wouldBuyAgain: (v.wouldBuyAgain as WouldBuyAgain | null) ?? null,
        noseNotes: this.strOrNull(v.noseNotes),
        noseTags: v.noseTags ?? [],
        palateTags: v.palateTags ?? [],
        palateNotes: this.strOrNull(v.palateNotes),
        finishTags: v.finishTags ?? [],
        finishNotes: this.strOrNull(v.finishNotes),
        finishLength: (v.finishLength as FinishLength | null) ?? null,
        personalNotes: this.strOrNull(v.personalNotes),
        labelPhotoUrl: null, // photo support lands in Iteration 3
        entryDate: this.toTimestamp(v.entryDate) ?? Timestamp.now(),
      };

      const newId = await this.logService.add(input);
      await this.presentToast('Added to your Cellar.');
      await this.router.navigateByUrl(`/entry/${newId}`, { replaceUrl: true });
    } catch {
      await this.presentToast(
        "Couldn't save. Check your connection and try again."
      );
    } finally {
      this.saving = false;
    }
  }

  private numOrNull(v: unknown): number | null {
    if (v === null || v === undefined || v === '') {
      return null;
    }
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  private strOrNull(v: string | null | undefined): string | null {
    const t = (v ?? '').trim();
    return t.length ? t : null;
  }

  private toTimestamp(iso: string | null): Timestamp | null {
    if (!iso) {
      return null;
    }
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : Timestamp.fromDate(date);
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
