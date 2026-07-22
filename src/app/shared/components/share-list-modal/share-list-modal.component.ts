import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { FormControl } from '@angular/forms';
import { Router } from '@angular/router';
import { ModalController, ToastController } from '@ionic/angular';

import { FriendView } from '../../../models';
import { FriendService } from '../../../core/services/friend.service';
import { SharingService } from '../../../core/services/sharing.service';

/**
 * Share-my-hunt-list sheet (BB-230d). Same friend-picker shape as the bottle
 * share, minus the per-bottle fields: the server reads the sharer's active hunt
 * list itself and freezes a snapshot, so this only gathers the recipient + note.
 * `bottleCount` is display-only (a live count for the CTA); the authoritative
 * count comes back from the callable.
 */
@Component({
  selector: 'app-share-list-modal',
  templateUrl: './share-list-modal.component.html',
  styleUrls: ['./share-list-modal.component.scss'],
  standalone: false,
})
export class ShareListModalComponent implements OnInit {
  private readonly friendService = inject(FriendService);
  private readonly sharing = inject(SharingService);
  private readonly modalCtrl = inject(ModalController);
  private readonly toastCtrl = inject(ToastController);
  private readonly router = inject(Router);

  /** How many active bottles are on the list right now (display only). */
  @Input() bottleCount = 0;

  readonly friends = signal<FriendView[]>([]);
  readonly loading = signal(true);
  readonly selectedUid = signal<string | null>(null);
  readonly busy = signal(false);

  readonly note = new FormControl('', { nonNullable: true });

  async ngOnInit(): Promise<void> {
    try {
      this.friends.set(await this.friendService.friendsOnce());
    } catch {
      this.friends.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async share(): Promise<void> {
    const toUid = this.selectedUid();
    if (!toUid || this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      const { bottleCount } = await this.sharing.shareList({
        toUid,
        note: this.note.value.trim() || null,
      });
      const friend = this.friends().find((f) => f.uid === toUid);
      await this.presentToast(
        `Shared ${bottleCount} bottle${bottleCount === 1 ? '' : 's'} with ${
          friend?.displayName ?? 'your friend'
        }.`
      );
      await this.modalCtrl.dismiss(null, 'shared');
    } catch {
      await this.presentToast("Couldn't share your list. Try again.");
    } finally {
      this.busy.set(false);
    }
  }

  async goToFriends(): Promise<void> {
    await this.modalCtrl.dismiss(null, 'cancel');
    await this.router.navigate(['/friends']);
  }

  async close(): Promise<void> {
    await this.modalCtrl.dismiss(null, 'cancel');
  }

  private async presentToast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 2200 });
    await toast.present();
  }
}
