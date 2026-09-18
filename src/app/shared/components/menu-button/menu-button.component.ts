import { Component, inject } from '@angular/core';

import { AppMenuService } from '../../../core/services/app-menu.service';
import { InboxService } from '../../../core/services/inbox.service';

/**
 * The one header control every main tab carries (BB-247) — opens the app menu
 * drawer. Deliberately a plain `ion-button` rather than `ion-menu-button` so
 * the unread badge can sit on top of the icon (Ionic's menu button only
 * exposes an icon slot).
 *
 * Drop it inside the toolbar's own `ion-buttons` so Ionic still sees a direct
 * slotted child:
 *
 * ```html
 * <ion-buttons slot="end"><app-menu-button></app-menu-button></ion-buttons>
 * ```
 */
@Component({
  selector: 'app-menu-button',
  templateUrl: './menu-button.component.html',
  styleUrls: ['./menu-button.component.scss'],
  standalone: false,
})
export class MenuButtonComponent {
  private readonly appMenu = inject(AppMenuService);
  private readonly inbox = inject(InboxService);

  /** Unread inbox count — the badge moved off the Cellar-only bell. */
  readonly unread = this.inbox.unread;
  readonly expanded = this.appMenu.isOpen;

  open(): void {
    void this.appMenu.open();
  }
}
