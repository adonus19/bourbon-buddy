import { Injectable, inject } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { ToastController } from '@ionic/angular';
import { filter } from 'rxjs/operators';

/**
 * Surfaces service-worker updates to the user. Without this, an installed PWA
 * keeps running the cached shell until a full double-refresh — users would
 * effectively be pinned to old versions. On VERSION_READY we offer a one-tap
 * reload; declining is fine, the new version activates on the next launch.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly updates = inject(SwUpdate);
  private readonly toast = inject(ToastController);

  init(): void {
    // isEnabled is false in dev builds and on browsers without SW support.
    if (!this.updates.isEnabled) {
      return;
    }
    this.updates.versionUpdates
      .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
      .subscribe(() => void this.offerReload());
  }

  private async offerReload(): Promise<void> {
    const toast = await this.toast.create({
      message: 'A new version of Bourbon Buddy is ready.',
      position: 'top',
      duration: 10000,
      buttons: [{ text: 'Reload', role: 'reload' }],
    });
    await toast.present();
    const { role } = await toast.onDidDismiss();
    if (role === 'reload') {
      this.reloadPage();
    }
  }

  /** Seam for tests; jsdom can't perform a real navigation reload. */
  protected reloadPage(): void {
    document.location.reload();
  }
}
