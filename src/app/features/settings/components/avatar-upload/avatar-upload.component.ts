import { Component, computed, inject, input, output, signal } from '@angular/core';
import { ToastController } from '@ionic/angular';

import { StorageService } from '../../../../core/services/storage.service';

/**
 * Self-contained avatar picker + uploader. Presentational + interaction only;
 * the parent persists the returned URL to the profile. Uses signal-based
 * inputs/outputs (modern Angular).
 */
@Component({
  selector: 'app-avatar-upload',
  templateUrl: './avatar-upload.component.html',
  styleUrls: ['./avatar-upload.component.scss'],
  standalone: false,
})
export class AvatarUploadComponent {
  private readonly storage = inject(StorageService);
  private readonly toast = inject(ToastController);

  readonly uid = input.required<string>();
  readonly avatarUrl = input<string | null>(null);
  readonly displayName = input<string>('');

  /** Emits the new download URL after a successful upload. */
  readonly avatarUploaded = output<string>();

  readonly uploading = signal(false);

  readonly initials = computed(() => {
    const name = this.displayName().trim();
    if (!name) {
      return '?';
    }
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  });

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    this.uploading.set(true);
    try {
      const url = await this.storage.uploadAvatar(this.uid(), file);
      this.avatarUploaded.emit(url);
    } catch {
      await this.presentToast(
        "Photo didn't upload. Try again or skip for now."
      );
    } finally {
      this.uploading.set(false);
      input.value = ''; // allow re-selecting the same file
    }
  }

  private async presentToast(message: string): Promise<void> {
    const t = await this.toast.create({
      message,
      duration: 2500,
      position: 'top',
    });
    await t.present();
  }
}
