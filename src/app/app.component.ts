import { Component, OnInit, inject, signal } from '@angular/core';
import { NavigationEnd, NavigationError, Router } from '@angular/router';
import { filter, take } from 'rxjs/operators';

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
  private readonly router = inject(Router);

  // Boot splash (BB-218): fading = CSS opacity transition running;
  // gone = removed from the DOM. Flips on the first *settled* navigation —
  // NavigationEnd (a page actually rendered) or NavigationError (never trap
  // the user behind the splash). Guard redirects emit NavigationCancel and
  // are deliberately ignored: their follow-up navigation still ends.
  readonly bootSplashFading = signal(false);
  readonly bootSplashGone = signal(false);

  constructor() {
    this.router.events
      .pipe(
        filter(
          (e) => e instanceof NavigationEnd || e instanceof NavigationError
        ),
        take(1)
      )
      .subscribe(() => {
        this.bootSplashFading.set(true);
        // Matches the 400ms opacity transition in the index.html style block.
        setTimeout(() => this.bootSplashGone.set(true), 450);
      });
  }

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
