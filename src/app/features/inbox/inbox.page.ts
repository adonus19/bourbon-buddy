import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';

import { AppNotification, NotificationType } from '../../models';
import { InboxService } from '../../core/services/inbox.service';
import { relativeTime } from '../../shared/utils/relative-time';

const TYPE_ICON: Record<NotificationType, string> = {
  sightingMatch: 'pricetag',
  priceAlert: 'trending-down',
  friendRequest: 'person-add',
  newsDigest: 'newspaper',
  accessRequest: 'key',
};

/**
 * Notification inbox (BB-113): the recoverable record of alerts. The list
 * listener lives only while this page is on screen; tapping an item marks it
 * read and deep-links to the relevant screen.
 */
@Component({
  selector: 'app-inbox',
  templateUrl: './inbox.page.html',
  styleUrls: ['./inbox.page.scss'],
  standalone: false,
})
export class InboxPage {
  private readonly inbox = inject(InboxService);
  private readonly router = inject(Router);

  readonly items = toSignal(this.inbox.inbox$(), {
    initialValue: [] as AppNotification[],
  });
  readonly hasUnread = computed(() => this.items().some((n) => !n.read));

  icon(type: NotificationType): string {
    return TYPE_ICON[type] ?? 'notifications';
  }

  when(n: AppNotification): string {
    return relativeTime(n.createdAt?.toDate() ?? null);
  }

  async open(n: AppNotification): Promise<void> {
    if (n.id && !n.read) {
      await this.inbox.markRead(n.id);
    }
    if (n.link) {
      await this.router.navigateByUrl(n.link);
    }
  }

  async markAllRead(): Promise<void> {
    await this.inbox.markAllRead(this.items());
  }
}
