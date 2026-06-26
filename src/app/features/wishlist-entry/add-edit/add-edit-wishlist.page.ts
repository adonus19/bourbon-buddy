import { Component, effect, inject } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController } from '@ionic/angular';

import {
  ACTIVE_WISHLIST_STATUSES,
  Bourbon,
  BourbonCategory,
  BourbonSubType,
  WishlistEntry,
  WishlistPriority,
  WishlistStatus,
} from '../../../models';
import {
  WishlistInput,
  WishlistService,
} from '../../../core/services/wishlist.service';
import { BourbonCatalogService } from '../../../core/services/bourbon-catalog.service';

@Component({
  selector: 'app-add-edit-wishlist',
  templateUrl: './add-edit-wishlist.page.html',
  styleUrls: ['./add-edit-wishlist.page.scss'],
  standalone: false,
})
export class AddEditWishlistPage {
  private readonly fb = inject(FormBuilder);
  private readonly wishlist = inject(WishlistService);
  private readonly catalog = inject(BourbonCatalogService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastController);

  readonly editId =
    this.route.snapshot.paramMap.get('id') ??
    this.route.snapshot.parent?.paramMap.get('id') ??
    null;
  get isEditMode(): boolean {
    return !!this.editId;
  }

  saving = false;
  private patched = false;
  // Preserve archive states (logged / got_away) across an edit.
  private originalStatus: WishlistStatus | null = null;

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

  readonly priorities: { value: WishlistPriority; label: string }[] = [
    { value: 'grail', label: 'Unicorn (must-have)' },
    { value: 'high', label: 'High' },
    { value: 'normal', label: 'Normal' },
    { value: 'low', label: 'Low' },
  ];

  readonly statuses: { value: WishlistStatus; label: string }[] = [
    { value: 'actively_looking', label: 'Actively Looking' },
    { value: 'casually_looking', label: 'Casually Looking' },
    { value: 'just_browsing', label: 'Just Browsing' },
  ];

  readonly form = this.fb.group({
    bourbonName: ['', [Validators.required, Validators.maxLength(120)]],
    bourbonId: [''],
    distillery: [''],
    category: [null as BourbonCategory | null],
    subType: [null as string | null],
    msrp: [null as number | null],
    priority: ['normal' as WishlistPriority],
    status: ['actively_looking' as WishlistStatus],
    externalTastingNotes: [''],
    personalNotes: [''],
    discoverySource: [''],
    discoveryUrl: [''],
    reviewLinks: this.fb.array<FormGroup>([]),
  });

  get reviewLinks(): FormArray<FormGroup> {
    return this.form.controls.reviewLinks;
  }

  private readonly editEntry = this.editId
    ? this.wishlist.selectById(this.editId)
    : null;

  constructor() {
    if (this.editEntry) {
      effect(() => {
        const e = this.editEntry?.();
        if (e && !this.patched) {
          this.patched = true;
          this.patchFromEntry(e);
        }
      });
    }
  }

  private patchFromEntry(e: WishlistEntry): void {
    this.originalStatus = e.status;
    this.form.patchValue({
      bourbonName: e.bourbonName,
      bourbonId: e.bourbonId,
      distillery: e.distillery ?? '',
      category: e.category ?? null,
      subType: e.subType ?? null,
      msrp: e.msrp ?? null,
      priority: e.priority,
      status: ACTIVE_WISHLIST_STATUSES.includes(e.status)
        ? e.status
        : 'actively_looking',
      externalTastingNotes: e.externalTastingNotes ?? '',
      personalNotes: e.personalNotes ?? '',
      discoverySource: e.discoverySource ?? '',
      discoveryUrl: e.discoveryUrl ?? '',
    });
    this.reviewLinks.clear();
    for (const link of e.reviewLinks ?? []) {
      this.reviewLinks.push(this.newLinkGroup(link.url, link.label ?? ''));
    }
  }

  private newLinkGroup(url = '', label = ''): FormGroup {
    return this.fb.group({
      url: [url, [Validators.required]],
      label: [label],
    });
  }

  addReviewLink(): void {
    this.reviewLinks.push(this.newLinkGroup());
  }
  removeReviewLink(i: number): void {
    this.reviewLinks.removeAt(i);
  }

  onNameInput(value: string): void {
    this.form.controls.bourbonName.setValue(value);
    this.form.controls.bourbonName.markAsDirty();
    this.form.controls.bourbonId.setValue('');
  }

  onBottleSelected(b: Bourbon): void {
    this.form.patchValue({
      bourbonName: b.name,
      bourbonId: b.id ?? '',
      distillery: b.distillery ?? '',
      category: (b.category as BourbonCategory) ?? this.form.controls.category.value,
      subType: b.subType ?? null,
      msrp: b.msrp ?? this.form.controls.msrp.value,
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
          category: (v.category as BourbonCategory | null) ?? null,
          subType: (v.subType as BourbonSubType | null) ?? null,
          ageStatement: null,
          isNas: false,
          proof: null,
          series: null,
        }));

      const reviewLinks = (v.reviewLinks ?? [])
        .map((l) => ({
          url: (l['url'] ?? '').trim(),
          label: ((l['label'] ?? '') as string).trim() || null,
        }))
        .filter((l) => l.url.length > 0);

      const input: WishlistInput = {
        bourbonId,
        bourbonName: name,
        distillery: this.strOrNull(v.distillery),
        category: (v.category as BourbonCategory | null) ?? null,
        subType: (v.subType as BourbonSubType | null) ?? null,
        msrp: this.numOrNull(v.msrp),
        externalTastingNotes: this.strOrNull(v.externalTastingNotes),
        reviewLinks,
        personalNotes: this.strOrNull(v.personalNotes),
        discoverySource: this.strOrNull(v.discoverySource),
        discoveryUrl: this.strOrNull(v.discoveryUrl),
        priority: (v.priority as WishlistPriority) ?? 'normal',
        // Keep an archived bottle archived even after an edit.
        status:
          this.originalStatus === 'logged' || this.originalStatus === 'got_away'
            ? this.originalStatus
            : (v.status as WishlistStatus) ?? 'actively_looking',
      };

      if (this.editId) {
        await this.wishlist.update(this.editId, input);
        await this.presentToast('Updated.');
        await this.router.navigateByUrl(`/wishlist/${this.editId}`, {
          replaceUrl: true,
        });
      } else {
        const newId = await this.wishlist.add(input);
        await this.presentToast('Added to the Hunt List.');
        await this.router.navigateByUrl(`/wishlist/${newId}`, {
          replaceUrl: true,
        });
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

  private async presentToast(message: string): Promise<void> {
    const t = await this.toast.create({
      message,
      duration: 2000,
      position: 'top',
    });
    await t.present();
  }
}
