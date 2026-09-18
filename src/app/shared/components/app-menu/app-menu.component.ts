import { Component, Input, computed, inject } from '@angular/core';
import { Router } from '@angular/router';

import { ACTIVE_WISHLIST_STATUSES } from '../../../models';
import { AppMenuService } from '../../../core/services/app-menu.service';
import { InboxService } from '../../../core/services/inbox.service';
import { WishlistService } from '../../../core/services/wishlist.service';

/**
 * The app menu drawer (BB-247) — one right-side sheet holding every action
 * that used to be scattered across the Cellar and Hunt List header end-slots.
 * Mounted once at the app root, identical on every tab, so the top-right of
 * the app means the same thing everywhere.
 *
 * Two items route to the Hunt tab with a query flag rather than opening their
 * modal here: the lookup sheet pulls in the barcode scanner (@zxing/browser),
 * the preview sheet and TasteMatchService, all of which must stay inside the
 * lazy Hunt chunk and out of the eager app bundle (BB-228). HuntListPage picks
 * the flag up and opens the modal on arrival.
 */
@Component({
  selector: 'app-menu',
  templateUrl: './app-menu.component.html',
  styleUrls: ['./app-menu.component.scss'],
  standalone: false,
})
export class AppMenuComponent {
  /**
   * Set while the user is outside the tab shell (login, a detail page). The
   * drawer's actions all assume a signed-in user inside the tabs, and the
   * trigger isn't rendered there, so the menu is disabled rather than merely
   * hidden — nothing can open it programmatically either.
   */
  @Input() disabled = false;

  private readonly router = inject(Router);
  private readonly appMenu = inject(AppMenuService);
  private readonly wishlist = inject(WishlistService);
  private readonly inbox = inject(InboxService);

  readonly unread = this.inbox.unread;

  /**
   * Bottles still being hunted. Derived from the wishlist holder's already-open
   * listener — no read of its own (see the Firebase discipline in CLAUDE.md).
   */
  readonly activeCount = computed(
    () =>
      this.wishlist
        .entries()
        .filter((e) => ACTIVE_WISHLIST_STATUSES.includes(e.status)).length
  );

  onOpen(): void {
    this.appMenu.setOpen(true);
  }

  onClose(): void {
    this.appMenu.setOpen(false);
  }

  close(): void {
    void this.appMenu.close();
  }

  /** Close first, then navigate — so the drawer isn't animating over the
   * incoming page, and a mid-navigation failure can't strand it open. */
  async go(commands: unknown[], queryParams?: Record<string, unknown>): Promise<void> {
    await this.appMenu.close();
    await this.router.navigate(commands, queryParams ? { queryParams } : {});
  }
}
