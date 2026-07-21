import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { FormControl } from '@angular/forms';
import { Router } from '@angular/router';
import { ModalController, ToastController } from '@ionic/angular';

import { BourbonCategory, FriendView } from '../../../models';
import { FriendService } from '../../../core/services/friend.service';
import { SharingService } from '../../../core/services/sharing.service';

/** The bottle a surface hands the share modal (BB-230b). */
export interface ShareBottleTarget {
  name: string;
  bourbonId?: string | null;
  distillery?: string | null;
  category?: BourbonCategory | null;
}

/**
 * Share-a-bottle sheet (BB-230b), opened from Cellar detail, Hunt List detail,
 * and the bottle preview sheet (Radar + Dispatch). Friends-only by design: it
 * lists the user's friends, an optional note, and — only when the surface has
 * one (Cellar) — an opt-in to include the user's own rating. The actual write
 * goes through the guarded `shareBottle` callable; this component just gathers
 * the choice. What's shared is the catalog bottle, never the log entry.
 */
@Component({
  selector: 'app-share-bottle-modal',
  templateUrl: './share-bottle-modal.component.html',
  styleUrls: ['./share-bottle-modal.component.scss'],
  standalone: false,
})
export class ShareBottleModalComponent implements OnInit {
  private readonly friendService = inject(FriendService);
  private readonly sharing = inject(SharingService);
  private readonly modalCtrl = inject(ModalController);
  private readonly toastCtrl = inject(ToastController);
  private readonly router = inject(Router);

  /** The bottle to share (componentProps). */
  @Input({ required: true }) bottle!: ShareBottleTarget;
  /** The user's own rating for this bottle, when the surface has one (Cellar). */
  @Input() myRating: number | null = null;

  readonly friends = signal<FriendView[]>([]);
  readonly loading = signal(true);
  readonly selectedUid = signal<string | null>(null);
  readonly includeRating = signal(false);
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
      await this.sharing.shareBottle({
        toUid,
        bourbonId: this.bottle.bourbonId ?? null,
        bottle: {
          name: this.bottle.name,
          distillery: this.bottle.distillery ?? null,
          category: this.bottle.category ?? null,
        },
        note: this.note.value.trim() || null,
        sharerRating:
          this.myRating != null && this.includeRating() ? this.myRating : null,
      });
      const friend = this.friends().find((f) => f.uid === toUid);
      await this.presentToast(
        `Shared ${this.bottle.name} with ${friend?.displayName ?? 'your friend'}.`
      );
      await this.modalCtrl.dismiss(null, 'shared');
    } catch {
      await this.presentToast("Couldn't share that bottle. Try again.");
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
