import { Component, inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ModalController } from '@ionic/angular';

/**
 * Bottom-sheet form for reporting a price sighting. Presentational: it collects
 * and validates input, then dismisses with the raw values; the opener converts
 * the date and writes via SightingService.
 */
@Component({
  selector: 'app-sighting-form',
  templateUrl: './sighting-form.component.html',
  styleUrls: ['./sighting-form.component.scss'],
  standalone: false,
})
export class SightingFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly modalCtrl = inject(ModalController);

  readonly form = this.fb.group({
    storeName: ['', [Validators.required, Validators.maxLength(120)]],
    price: [null as number | null, [Validators.required]],
    sightingDate: [new Date().toISOString().slice(0, 10), [Validators.required]],
    city: [''],
    state: [''],
    notes: [''],
  });

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    void this.modalCtrl.dismiss(this.form.getRawValue(), 'save');
  }

  cancel(): void {
    void this.modalCtrl.dismiss(null, 'cancel');
  }
}
