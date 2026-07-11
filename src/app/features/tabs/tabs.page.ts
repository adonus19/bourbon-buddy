import { Component, OnInit, inject } from '@angular/core';

import { NewsService } from '../../core/services/news.service';
import { OnboardingService } from '../../core/onboarding/onboarding.service';

@Component({
  selector: 'app-tabs',
  templateUrl: './tabs.page.html',
  styleUrls: ['./tabs.page.scss'],
  standalone: false,
})
export class TabsPage implements OnInit {
  private readonly news = inject(NewsService);
  private readonly onboarding = inject(OnboardingService);

  /** Approximate unread-news count for the Dispatch tab badge. */
  readonly unreadCount = this.news.unreadCount;

  ngOnInit(): void {
    // Load once so the badge reflects unread news without visiting the tab.
    void this.news.ensureLoaded();
    // First time the user reaches the shell, offer the guided walkthrough.
    // No-ops once it's been completed or skipped. Deferred a beat so the tab
    // bar (the tour's first anchors) is mounted before we measure.
    setTimeout(() => this.onboarding.maybeStartFirstRun(), 400);
  }
}
