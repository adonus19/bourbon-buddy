import { Component, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ModalController } from '@ionic/angular';

/**
 * Bottom-sheet form for logging a pour from a purchased bottle. Collects and
 * dismisses raw values; the opener converts the date and writes via the service.
 */
@Component({
  selector: 'app-pour-form',
  templateUrl: './pour-form.component.html',
  styleUrls: ['./pour-form.component.scss'],
  standalone: false,
})
export class PourFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly modalCtrl = inject(ModalController);

  readonly rating = signal<number | null>(null);

  readonly form = this.fb.group({
    pourDate: [new Date().toISOString().slice(0, 10), [Validators.required]],
    settingNotes: [''],
    tastingNotes: [''],
  });

  setRating(value: number): void {
    this.rating.set(value);
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    void this.modalCtrl.dismiss(
      { ...this.form.getRawValue(), rating: this.rating() },
      'save'
    );
  }

  cancel(): void {
    void this.modalCtrl.dismiss(null, 'cancel');
  }
}
