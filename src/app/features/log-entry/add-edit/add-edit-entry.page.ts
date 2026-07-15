import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';
import { Timestamp } from '@angular/fire/firestore';

import {
  Bourbon,
  BourbonCategory,
  BourbonSubType,
  EntryType,
  FinishLength,
  LogEntry,
  OWNED_ENTRY_TYPES,
  WishlistEntry,
  WouldBuyAgain,
} from '../../../models';
import {
  LogEntryInput,
  LogEntryService,
} from '../../../core/services/log-entry.service';
import {
  BourbonCatalogService,
  FlavorSuggestions,
} from '../../../core/services/bourbon-catalog.service';
import { BarcodeScannerService } from '../../../core/services/barcode-scanner.service';
import { StorageService } from '../../../core/services/storage.service';
import { WishlistService } from '../../../core/services/wishlist.service';
import { AuthService } from '../../../core/auth/auth.service';
import {
  EntryFieldRules,
  deriveDidNotPurchase,
  fieldRulesFor,
} from './entry-field-rules';
import { foundItPrefill } from './found-it-prefill';

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
  private readonly alertCtrl = inject(AlertController);

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

  // "Buy Again" (BB-193): /entry/new?buyAgainFrom={id} clones a prior bottle's
  // identity + spec into a fresh purchase instance, linked via repurchaseOfEntryId.
  readonly buyAgainFromId = this.route.snapshot.queryParamMap.get('buyAgainFrom');
  private repurchaseOfEntryId: string | null = null;

  saving = false;

  // AI flavor auto-populate (BB-186): tags pre-filled from the catalog profile,
  // tracked separately so the picker can mark them "suggested" vs user-chosen.
  readonly suggestedFlavors = signal<FlavorSuggestions>({
    nose: [],
    palate: [],
    finish: [],
  });
  readonly loadingSuggestions = signal(false);

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
    barrelLabel: [''],
    series: [''],
    // How you got it
    entryType: ['drink'],
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

  // Reactive view of entryType: it alone drives which acquisition fields show
  // (BB-215) — there is no "Didn't purchase" toggle anymore.
  private readonly entryTypeValue = signal(this.form.controls.entryType.value);

  // Legacy escape hatch: in edit mode, a field the type rules would hide stays
  // visible when the stored entry has a value there, so nothing is dropped
  // silently on save.
  private readonly legacyFields = signal<Partial<EntryFieldRules>>({});
  readonly fieldRules = computed<EntryFieldRules>(() => {
    const rules = fieldRulesFor(
      (this.entryTypeValue() as EntryType) ?? 'drink'
    );
    const legacy = this.legacyFields();
    return {
      price: rules.price || !!legacy.price,
      bottleSize: rules.bottleSize || !!legacy.bottleSize,
      where: rules.where,
      dateLabel: rules.dateLabel ?? legacy.dateLabel ?? null,
      remaining: rules.remaining || !!legacy.remaining,
    };
  });

  // Reactive view of subType so the template can reveal the barrel-label
  // (store-pick) field only for single barrels (BB-195).
  private readonly subTypeValue = signal(this.form.controls.subType.value);
  readonly isSingleBarrel = computed(
    () => this.subTypeValue() === 'single_barrel'
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
  private readonly sourceRebuy =
    !this.editId && this.buyAgainFromId
      ? this.logService.selectById(this.buyAgainFromId)
      : null;

  constructor() {
    this.form.controls.entryType.valueChanges.subscribe((v) =>
      this.entryTypeValue.set(v)
    );
    this.form.controls.subType.valueChanges.subscribe((v) =>
      this.subTypeValue.set(v)
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
        // Wait for the cellar signal too — prior entries feed the prefill.
        const w = this.sourceWishlist?.();
        if (w && this.logService.loaded() && !this.patched) {
          this.patched = true;
          void this.prefillFromWishlist(w);
        }
      });
    } else if (this.sourceRebuy) {
      effect(() => {
        const e = this.sourceRebuy?.();
        if (e && !this.patched) {
          this.patched = true;
          void this.prefillFromRebuy(e);
        }
      });
    }
  }

  /**
   * "Buy Again" (BB-193): clone a prior bottle's identity + spec into a fresh
   * purchase instance. Experience fields reset (new dates, full, blank
   * price/rating, empty pour log); prior tags carry as *suggested* starting
   * points; a single-barrel rebuy never silently copies the barrel identity.
   */
  private async prefillFromRebuy(e: LogEntry): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
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
      series: e.series ?? '',
      entryType: 'bottle_purchased',
      purchaseDate: today,
      entryDate: today,
      bottleRemainingPct: 100,
    });
    this.repurchaseOfEntryId = e.id ?? null;

    if (e.subType === 'single_barrel' && (e.barrelNumber || e.barrelLabel)) {
      const sameBarrel = await this.askSameBarrel(e);
      if (sameBarrel) {
        this.form.patchValue({
          barrelNumber: e.barrelNumber ?? '',
          barrelLabel: e.barrelLabel ?? '',
        });
      }
    }

    const next: FlavorSuggestions = {
      nose: e.noseTags ?? [],
      palate: e.palateTags ?? [],
      finish: e.finishTags ?? [],
    };
    this.form.patchValue({
      noseTags: next.nose,
      palateTags: next.palate,
      finishTags: next.finish,
    });
    this.suggestedFlavors.set(next);
  }

  /** Ask whether a single-barrel rebuy is the same pick or a new barrel. */
  private async askSameBarrel(e: LogEntry): Promise<boolean> {
    const pick =
      e.barrelLabel ||
      (e.barrelNumber ? `Barrel ${e.barrelNumber}` : 'the same pick');
    const alert = await this.alertCtrl.create({
      header: 'Same barrel?',
      message: `Single barrels vary bottle to bottle. Is this the same pick (${pick}) or a new one?`,
      buttons: [
        { text: 'New barrel', role: 'cancel' },
        { text: 'Same pick', role: 'confirm' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    return role === 'confirm';
  }

  /**
   * Pre-fill the add-log form from a wishlist entry ("Found It — Log It"),
   * enriched with the catalog doc (proof/age/bottler/series) and the user's
   * own prior entries for this bottle — mash bill, last rating, tasting
   * tags/notes (BB-216). Prior tags become the "suggested" set; only when no
   * prior entry has tags do we fall back to the AI suggestions.
   */
  private async prefillFromWishlist(w: WishlistEntry): Promise<void> {
    const catalogDoc = await this.catalog.getById(w.bourbonId).catch(() => null);
    const { patch, priorTags } = foundItPrefill(
      w,
      catalogDoc,
      this.logService.entries(),
      new Date().toISOString().slice(0, 10)
    );
    this.form.patchValue(patch);
    if (patch.isNas) {
      this.form.controls.ageStatement.disable();
    }
    if (priorTags) {
      this.suggestedFlavors.set(priorTags);
    } else {
      void this.autoPopulateFlavors(w.bourbonId);
    }
  }

  /**
   * Pre-select AI flavor suggestions for the chosen bottle (BB-186). Add-mode
   * only, and never clobbers tags you've already entered. Best-effort: a
   * failure/no-profile just leaves the picker empty.
   */
  private async autoPopulateFlavors(bourbonId: string): Promise<void> {
    if (this.isEditMode || !bourbonId) {
      return;
    }
    // Only auto-fill when the tags are empty or still exactly the last applied
    // suggestion (untouched) — re-picking a bottle refreshes them, but tags
    // you've edited yourself are never overwritten.
    if (!this.tagsAreUntouchedSuggestions()) {
      return;
    }
    this.loadingSuggestions.set(true);
    try {
      const s = await this.catalog.getFlavorSuggestions(bourbonId);
      if (!this.tagsAreUntouchedSuggestions()) {
        return; // the user started editing during the lookup
      }
      const next: FlavorSuggestions = s ?? { nose: [], palate: [], finish: [] };
      this.form.patchValue({
        noseTags: next.nose,
        palateTags: next.palate,
        finishTags: next.finish,
      });
      this.suggestedFlavors.set(next);
    } finally {
      this.loadingSuggestions.set(false);
    }
  }

  /** Current flavor tags are empty or still exactly the last suggestion set. */
  private tagsAreUntouchedSuggestions(): boolean {
    const c = this.form.controls;
    const s = this.suggestedFlavors();
    return (
      this.sameList(c.noseTags.value ?? [], s.nose) &&
      this.sameList(c.palateTags.value ?? [], s.palate) &&
      this.sameList(c.finishTags.value ?? [], s.finish)
    );
  }

  private sameList(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((v, i) => v === b[i]);
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
      barrelLabel: e.barrelLabel ?? '',
      series: e.series ?? '',
      entryType: e.entryType,
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
    this.subTypeValue.set(e.subType ?? null);
    this.repurchaseOfEntryId = e.repurchaseOfEntryId ?? null;
    if (e.isNas) {
      this.form.controls.ageStatement.disable();
    }
    // Keep populated fields visible even when this entry type would hide them
    // (legacy entries saved before BB-215).
    const rules = fieldRulesFor(e.entryType);
    this.legacyFields.set({
      price: !rules.price && e.purchasePrice != null,
      bottleSize: !rules.bottleSize && e.bottleSizeMl != null,
      dateLabel: !rules.dateLabel && e.purchaseDate ? 'Date' : null,
      remaining: !rules.remaining && e.bottleRemainingPct != null,
    });
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
    // Typing means we're no longer tied to a specific catalog doc — drop the
    // "suggested" marking (any pre-filled tags become your own to keep or clear).
    this.form.controls.bourbonId.setValue('');
    this.suggestedFlavors.set({ nose: [], palate: [], finish: [] });
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
    void this.autoPopulateFlavors(b.id ?? '');
  }

  // BB-175/176: a scanned code with no catalog match yet, attached on save.
  private pendingUpc: string | null = null;
  // Non-blocking indicator while a scanned code is looked up in the catalog.
  readonly lookingUp = signal(false);

  /** Scan a barcode to quick-add a bottle (BB-176). */
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
          "New barcode — fill in the bottle and we'll remember it."
        );
      }
    } finally {
      this.lookingUp.set(false);
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

      const entryType = (v.entryType as EntryType) ?? 'drink';
      // Effective visibility (type rules + legacy overrides): hidden fields are
      // nulled so the stored entry matches what the form showed.
      const visible = this.fieldRules();
      const bottleRemainingPct = visible.remaining
        ? this.numOrNull(v.bottleRemainingPct)
        : null;
      // Owned bottles carry an explicit lifecycle status (BB-191); a fresh entry
      // marked Empty is born finished. finishedAt is stamped later, on Kill.
      const bottleStatus = OWNED_ENTRY_TYPES.includes(entryType)
        ? bottleRemainingPct === 0
          ? 'finished'
          : 'open'
        : null;

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
        barrelLabel: this.strOrNull(v.barrelLabel),
        series: this.strOrNull(v.series),
        entryType,
        didNotPurchase: deriveDidNotPurchase(entryType),
        purchasePrice: visible.price ? this.numOrNull(v.purchasePrice) : null,
        purchaseLocation: this.strOrNull(v.purchaseLocation),
        purchaseDate: visible.dateLabel ? this.toTimestamp(v.purchaseDate) : null,
        bottleSizeMl: visible.bottleSize ? this.numOrNull(v.bottleSizeMl) : null,
        bottleRemainingPct,
        bottleStatus,
        repurchaseOfEntryId: this.repurchaseOfEntryId,
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
