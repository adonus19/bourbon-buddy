import { Component, OnInit, inject } from '@angular/core';

import { NewsService } from '../../core/services/news.service';

@Component({
  selector: 'app-tabs',
  templateUrl: './tabs.page.html',
  styleUrls: ['./tabs.page.scss'],
  standalone: false,
})
export class TabsPage implements OnInit {
  private readonly news = inject(NewsService);

  /** Approximate unread-news count for the Dispatch tab badge. */
  readonly unreadCount = this.news.unreadCount;

  ngOnInit(): void {
    // Load once so the badge reflects unread news without visiting the tab.
    void this.news.ensureLoaded();
  }
}
