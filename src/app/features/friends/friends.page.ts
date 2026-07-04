import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import {
  ActionSheetController,
  AlertController,
  NavController,
  ToastController,
} from '@ionic/angular';

import {
  BlockedUser,
  FriendRequest,
  FriendView,
  PublicProfile,
} from '../../models';
import { FriendService } from '../../core/services/friend.service';
import { friendErrorMessage } from '../../shared/utils/friend-error';

/**
 * Friends home (BB-101): find people by exact handle and send requests; see and
 * cancel your pending outgoing requests. Incoming requests and the friends list
 * arrive in BB-102/103. The request listener lives only while this page is on
 * screen (the signal is created in this component's injection context).
 */
@Component({
  selector: 'app-friends',
  templateUrl: './friends.page.html',
  styleUrls: ['./friends.page.scss'],
  standalone: false,
})
export class FriendsPage {
  private readonly friends = inject(FriendService);
  private readonly toast = inject(ToastController);
  private readonly actionSheet = inject(ActionSheetController);
  private readonly alertCtrl = inject(AlertController);
  private readonly router = inject(Router);
  private readonly nav = inject(NavController);

  readonly friendList = toSignal(this.friends.friends$(), {
    initialValue: [] as FriendView[],
  });
  readonly blocked = toSignal(this.friends.blocked$(), {
    initialValue: [] as BlockedUser[],
  });
  readonly incoming = toSignal(this.friends.incomingRequests$(), {
    initialValue: [] as FriendRequest[],
  });
  readonly outgoing = toSignal(this.friends.outgoingRequests$(), {
    initialValue: [] as FriendRequest[],
  });

  searchTerm = '';
  searching = false;
  searched = false;
  searchResult: PublicProfile | null = null;
  sending = false;
  respondingId: string | null = null;

  onTermChange(): void {
    // Hide a stale result the moment the query changes.
    this.searched = false;
    this.searchResult = null;
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.onTermChange();
  }

  async search(): Promise<void> {
    const term = this.searchTerm.trim();
    if (!term || this.searching) {
      return;
    }
    this.searching = true;
    this.searched = false;
    try {
      this.searchResult = await this.friends.searchByUsername(term);
    } catch {
      this.searchResult = null;
    } finally {
      this.searching = false;
      this.searched = true;
    }
  }

  /** True when I already have a pending request out to this user. */
  hasPendingTo(uid: string): boolean {
    return this.outgoing().some((r) => r.toUid === uid);
  }

  async add(uid: string): Promise<void> {
    if (this.sending) {
      return;
    }
    this.sending = true;
    try {
      await this.friends.sendFriendRequest(uid);
      await this.presentToast('Request sent.');
      this.clearSearch();
    } catch (err) {
      await this.presentToast(friendErrorMessage(err));
    } finally {
      this.sending = false;
    }
  }

  async accept(req: FriendRequest): Promise<void> {
    await this.respond(req, 'accept');
  }

  async decline(req: FriendRequest): Promise<void> {
    await this.respond(req, 'decline');
  }

  private async respond(
    req: FriendRequest,
    action: 'accept' | 'decline'
  ): Promise<void> {
    if (!req.id || this.respondingId) {
      return;
    }
    this.respondingId = req.id;
    try {
      await this.friends.respondToRequest(req.id, action);
      await this.presentToast(
        action === 'accept' ? 'Friend added.' : 'Request declined.'
      );
    } catch (err) {
      await this.presentToast(friendErrorMessage(err));
    } finally {
      this.respondingId = null;
    }
  }

  async cancel(req: FriendRequest): Promise<void> {
    if (!req.id) {
      return;
    }
    try {
      await this.friends.cancelRequest(req.id);
      await this.presentToast('Request canceled.');
    } catch {
      await this.presentToast("Couldn't cancel. Try again.");
    }
  }

  /** Segment: switch to the Feed view within the Social tab. */
  onSegment(value: string): void {
    if (value === 'feed') {
      void this.nav.navigateRoot(['/tabs/social/feed'], { animated: false });
    }
  }

  openProfile(uid: string): void {
    void this.router.navigate(['/u', uid]);
  }

  async openFriendMenu(friend: FriendView): Promise<void> {
    const sheet = await this.actionSheet.create({
      header: friend.displayName,
      buttons: [
        {
          text: 'Remove friend',
          role: 'destructive',
          handler: () => void this.confirmRemove(friend),
        },
        {
          text: 'Block',
          role: 'destructive',
          handler: () => void this.confirmBlock(friend),
        },
        { text: 'Cancel', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  private async confirmRemove(friend: FriendView): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Remove friend?',
      message: `Remove ${friend.displayName} from your friends?`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Remove',
          role: 'destructive',
          handler: () => void this.doRemove(friend.uid),
        },
      ],
    });
    await alert.present();
  }

  private async doRemove(uid: string): Promise<void> {
    try {
      await this.friends.removeFriend(uid);
      await this.presentToast('Friend removed.');
    } catch (err) {
      await this.presentToast(friendErrorMessage(err));
    }
  }

  private async confirmBlock(friend: FriendView): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Block this person?',
      message: `${friend.displayName} won't be able to find you, send requests, or see what you share. Any current friendship ends.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Block',
          role: 'destructive',
          handler: () => void this.doBlock(friend.uid),
        },
      ],
    });
    await alert.present();
  }

  private async doBlock(uid: string): Promise<void> {
    try {
      await this.friends.blockUser(uid);
      await this.presentToast('Blocked.');
    } catch (err) {
      await this.presentToast(friendErrorMessage(err));
    }
  }

  async unblock(b: BlockedUser): Promise<void> {
    if (!b.id) {
      return;
    }
    try {
      await this.friends.unblockUser(b.id);
      await this.presentToast('Unblocked.');
    } catch {
      await this.presentToast("Couldn't unblock. Try again.");
    }
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
