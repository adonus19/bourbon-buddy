import { Component, OnInit, inject } from '@angular/core';

import { AppUpdateService } from './core/services/app-update.service';
import { InboxService } from './core/services/inbox.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit {
  private readonly inbox = inject(InboxService);
  private readonly appUpdate = inject(AppUpdateService);

  ngOnInit(): void {
    this.appUpdate.init();
    // Keep the OS app-icon badge in step with unread inbox items (BB-093):
    // sync on launch and whenever the app returns to the foreground.
    this.syncBadge();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.syncBadge();
      }
    });
  }

  private syncBadge(): void {
    // unreadCount() applies the badge as a side effect (or clears it when 0 /
    // signed out); we don't need the return value here.
    void this.inbox.unreadCount();
  }
}
