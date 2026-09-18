import { Injectable, Signal, inject, signal } from '@angular/core';
import { MenuController } from '@ionic/angular';

import { InboxService } from './inbox.service';

/** Ionic menuId for the single app-wide drawer (BB-247). */
export const APP_MENU_ID = 'app-menu';

/**
 * Open/close state for the header menu drawer (BB-247).
 *
 * The trigger button and the drawer itself are separate components in separate
 * module graphs (the button rides in each lazy tab chunk, the drawer is mounted
 * once at the app root), so the shared state lives here rather than being
 * passed between them.
 */
@Injectable({ providedIn: 'root' })
export class AppMenuService {
  private readonly menu = inject(MenuController);
  private readonly inbox = inject(InboxService);

  private readonly openState = signal(false);

  /** True while the drawer is open — drives the trigger's `aria-expanded`. */
  readonly isOpen: Signal<boolean> = this.openState.asReadonly();

  async open(): Promise<void> {
    // Cheapest moment to resync the badge: the user is about to look at it.
    // One COUNT aggregation, no listener (see InboxService cost note).
    void this.inbox.unreadCount();
    await this.menu.open(APP_MENU_ID);
  }

  async close(): Promise<void> {
    await this.menu.close(APP_MENU_ID);
  }

  /** Called by the drawer's own ionDidOpen / ionDidClose. */
  setOpen(open: boolean): void {
    this.openState.set(open);
  }
}
