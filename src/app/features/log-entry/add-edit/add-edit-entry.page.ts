import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { Timestamp } from '@angular/fire/firestore';

import {
  Bourbon,
  BourbonCategory,
  BourbonSubType,
  EntryType,
  FinishLength,
  LogEntry,
  WishlistEntry,
  WouldBuyAgain,
} from '../../../models';
import {
  LogEntryInput,
  LogEntryService,
} from '../../../core/services/log-entry.service';
import { BourbonCatalogService } from '../../../core/services/bourbon-catalog.service';
import { BarcodeScannerService } from '../../../core/services/barcode-scanner.service';
import { StorageService } from '../../../core/services/storage.service';
import { WishlistService } from '../../../core/services/wishlist.service';
import { AuthService } from '../../../core/auth/auth.service';

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
  private readonly scanner = inject(BarcodeScannerService);
  private readonly storage = inject(StorageService);
  private readonly wishlist = inject(WishlistService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastController);

  // Edit mode when the route carries an :id (entry/:id/edit); else add mode.
  readonly editId =
    this.route.snapshot.paramMap.get('id') ??
    this.route.snapshot.parent?.paramMap.get('id') ??
    null;
  get isEditMode(): boolean {
    return !!this.editId;
  }

  // "Found It — Log It": /entry/new?fromWishlist={id} pre-fills from a wishlist
  // entry and archives it (status: 'logged') on save.
  readonly fromWishlistId =
    this.route.snapshot.queryParamMap.get('fromWishlist');

  saving = false;

  // Label photo: pending selection / removal applied on save.
  private photoFile: File | null = null;
  private photoRemoved = false;
  readonly existingPhotoUrl = signal<string | null>(null);
  private patched = false;

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
    { value: 'wheated', label: 'Wheated' },
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

  // In edit mode, the entry comes from the cached entries signal; patch the
  // form once it's available (and only once, so we don't clobber edits).
  private readonly editEntry = this.editId
    ? this.logService.selectById(this.editId)
    : null;
  private readonly sourceWishlist =
    !this.editId && this.fromWishlistId
      ? this.wishlist.selectById(this.fromWishlistId)
      : null;

  constructor() {
    this.form.controls.entryType.valueChanges.subscribe((v) =>
      this.entryTypeValue.set(v)
    );

    if (this.editEntry) {
      effect(() => {
        const e = this.editEntry?.();
        if (e && !this.patched) {
          this.patched = true;
          this.patchFromEntry(e);
        }
      });
    } else if (this.sourceWishlist) {
      effect(() => {
        const w = this.sourceWishlist?.();
        if (w && !this.patched) {
          this.patched = true;
          this.prefillFromWishlist(w);
        }
      });
    }
  }

  /** Pre-fill the add-log form from a wishlist entry ("Found It — Log It"). */
  private prefillFromWishlist(w: WishlistEntry): void {
    this.form.patchValue({
      bourbonName: w.bourbonName,
      bourbonId: w.bourbonId,
      distillery: w.distillery ?? '',
      category: w.category ?? this.form.controls.category.value,
      subType: w.subType ?? null,
      personalNotes: w.externalTastingNotes ?? '',
    });
  }

  private patchFromEntry(e: LogEntry): void {
    this.form.patchValue({
      bourbonName: e.bourbonName,
      bourbonId: e.bourbonId,
      distillery: e.distillery ?? '',
      bottler: e.bottler ?? '',
      category: e.category,
      subType: e.subType ?? null,
      ageStatement: e.ageStatement ?? null,
      isNas: e.isNas,
      proof: e.proof ?? null,
      mashBillCorn: e.mashBillCorn ?? null,
      mashBillRye: e.mashBillRye ?? null,
      mashBillWheat: e.mashBillWheat ?? null,
      mashBillMalt: e.mashBillMalt ?? null,
      batchNumber: e.batchNumber ?? '',
      barrelNumber: e.barrelNumber ?? '',
      series: e.series ?? '',
      entryType: e.entryType,
      didNotPurchase: e.didNotPurchase,
      purchasePrice: e.purchasePrice ?? null,
      purchaseLocation: e.purchaseLocation ?? '',
      purchaseDate: e.purchaseDate ? this.tsToDateStr(e.purchaseDate) : null,
      bottleSizeMl: e.bottleSizeMl ?? null,
      bottleRemainingPct: e.bottleRemainingPct ?? null,
      rating: e.rating ?? null,
      noseTags: e.noseTags ?? [],
      noseNotes: e.noseNotes ?? '',
      palateTags: e.palateTags ?? [],
      palateNotes: e.palateNotes ?? '',
      finishTags: e.finishTags ?? [],
      finishNotes: e.finishNotes ?? '',
      finishLength: e.finishLength ?? null,
      wouldBuyAgain: e.wouldBuyAgain ?? null,
      personalNotes: e.personalNotes ?? '',
      entryDate: this.tsToDateStr(e.entryDate),
    });
    this.entryTypeValue.set(e.entryType);
    if (e.isNas) {
      this.form.controls.ageStatement.disable();
    }
    if (e.didNotPurchase) {
      this.form.controls.purchasePrice.disable();
      this.form.controls.purchaseLocation.disable();
    }
    this.existingPhotoUrl.set(e.labelPhotoUrl ?? null);
  }

  // --- Label photo -------------------------------------------------------
  onPhotoSelected(file: File): void {
    this.photoFile = file;
    this.photoRemoved = false;
  }

  onPhotoCleared(): void {
    this.photoFile = null;
    this.photoRemoved = true;
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

  // BB-175/176: a scanned code with no catalog match yet, attached on save.
  private pendingUpc: string | null = null;

  /** Scan a barcode to quick-add a bottle (BB-176). */
  async scanBarcode(): Promise<void> {
    const result = await this.scanner.scan();
    if (!result) {
      return;
    }
    const match = await this.catalog.findByUpc(result.code);
    if (match) {
      this.pendingUpc = null;
      this.onBottleSelected(match);
      await this.presentToast(`Matched ${match.name}.`);
    } else {
      this.pendingUpc = result.code;
      await this.presentToast(
        "New barcode — fill in the bottle and we'll remember it."
      );
    }
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

      const baseInput: Omit<LogEntryInput, 'labelPhotoUrl'> = {
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
        entryDate: this.toTimestamp(v.entryDate) ?? Timestamp.now(),
      };

      if (this.editId) {
        const uid = this.requireUid();
        let labelPhotoUrl = this.existingPhotoUrl();
        if (this.photoFile) {
          labelPhotoUrl = await this.storage.uploadLabel(
            uid,
            this.editId,
            this.photoFile
          );
        } else if (this.photoRemoved) {
          await this.storage.deleteLabel(uid, this.editId);
          labelPhotoUrl = null;
        }
        await this.logService.update(this.editId, { ...baseInput, labelPhotoUrl });
        await this.presentToast('Updated.');
        await this.router.navigateByUrl(`/entry/${this.editId}`, {
          replaceUrl: true,
        });
      } else {
        const newId = await this.logService.add({
          ...baseInput,
          labelPhotoUrl: null,
        });
        // Best-effort: teach the UPC index (BB-175). Never fail the save for it.
        if (this.pendingUpc) {
          try {
            await this.catalog.addUpc(bourbonId, this.pendingUpc);
          } catch {
            // index update is non-critical; the entry already saved
          }
          this.pendingUpc = null;
        }
        if (this.photoFile) {
          const uid = this.requireUid();
          const url = await this.storage.uploadLabel(uid, newId, this.photoFile);
          await this.logService.setLabelPhotoUrl(newId, url);
        }

        let message = 'Added to your Cellar.';
        if (this.fromWishlistId) {
          // Archive the wishlist entry (kept, not deleted — visible in "Got Away").
          await this.wishlist.setStatus(this.fromWishlistId, 'logged');
          message =
            this.sourceWishlist?.()?.priority === 'grail'
              ? 'You actually found one. 🦄'
              : 'Found it — added to your Cellar.';
        }

        await this.presentToast(message);
        await this.router.navigateByUrl(`/entry/${newId}`, { replaceUrl: true });
      }
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

  private tsToDateStr(ts: Timestamp): string {
    return ts.toDate().toISOString().slice(0, 10);
  }

  private requireUid(): string {
    const uid = this.auth.snapshotUser?.uid;
    if (!uid) {
      throw new Error('Not signed in.');
    }
    return uid;
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
