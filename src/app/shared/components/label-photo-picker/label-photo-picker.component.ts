import { Component, computed, input, output, signal } from '@angular/core';

/**
 * Bottle-label photo picker. Presentational + interaction only: it shows the
 * current/selected image and emits the chosen File (or a clear event). The
 * parent uploads on save (a new entry has no id to key the Storage path until
 * it's been created).
 */
@Component({
  selector: 'app-label-photo-picker',
  templateUrl: './label-photo-picker.component.html',
  styleUrls: ['./label-photo-picker.component.scss'],
  standalone: false,
})
export class LabelPhotoPickerComponent {
  readonly existingUrl = input<string | null>(null);

  readonly fileSelected = output<File>();
  readonly cleared = output<void>();

  private readonly previewUrl = signal<string | null>(null);
  private readonly removed = signal(false);

  readonly displayUrl = computed(() => {
    const preview = this.previewUrl();
    if (preview) {
      return preview;
    }
    return this.removed() ? null : this.existingUrl();
  });

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    this.revokePreview();
    this.previewUrl.set(URL.createObjectURL(file));
    this.removed.set(false);
    this.fileSelected.emit(file);
    input.value = ''; // allow re-selecting the same file
  }

  clear(): void {
    this.revokePreview();
    this.previewUrl.set(null);
    this.removed.set(true);
    this.cleared.emit();
  }

  private revokePreview(): void {
    const prev = this.previewUrl();
    if (prev) {
      URL.revokeObjectURL(prev);
    }
  }
}
