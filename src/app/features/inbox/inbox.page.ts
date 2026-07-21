import { Component, computed, inject, signal } from '@angular/core';
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
  bottleShare: 'wine',
  listShare: 'list',
};

/**
 * Notification inbox (BB-113): the recoverable record of alerts. The list
 * listener lives only while this page is on screen; tapping an item marks it
 * read and deep-links to the relevant screen.
 *
 * Pruning (BB-214): an Edit mode multi-selects for bulk delete (Select all
 * when there's more than one item; no confirmation — they're notifications,
 * not data), and swiping a row deletes it directly outside edit mode. The
 * realtime listener reflects deletions, so the list heals itself.
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

  readonly editMode = signal(false);
  readonly selected = signal<ReadonlySet<string>>(new Set());
  readonly allSelected = computed(
    () =>
      this.items().length > 0 &&
      this.selected().size === this.items().length
  );

  icon(type: NotificationType): string {
    return TYPE_ICON[type] ?? 'notifications';
  }

  when(n: AppNotification): string {
    return relativeTime(n.createdAt?.toDate() ?? null);
  }

  /** In edit mode a tap toggles selection; otherwise mark-read + deep-link. */
  async open(n: AppNotification): Promise<void> {
    if (this.editMode()) {
      if (n.id) {
        this.toggleSelect(n.id);
      }
      return;
    }
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

  enterEdit(): void {
    this.editMode.set(true);
  }

  /** Done/Cancel: leaves edit mode and forgets the selection. */
  exitEdit(): void {
    this.editMode.set(false);
    this.selected.set(new Set());
  }

  toggleSelect(id: string): void {
    this.selected.update((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  toggleSelectAll(): void {
    if (this.allSelected()) {
      this.selected.set(new Set());
      return;
    }
    this.selected.set(
      new Set(
        this.items()
          .map((n) => n.id)
          .filter((id): id is string => !!id)
      )
    );
  }

  /** Bulk delete — no confirmation on purpose (they're just notifications). */
  async deleteSelected(): Promise<void> {
    const ids = [...this.selected()];
    if (!ids.length) {
      return;
    }
    const emptiesList = ids.length === this.items().length;
    await this.inbox.remove(ids);
    this.selected.set(new Set());
    if (emptiesList) {
      // Nothing left to edit — fall back to the empty state.
      this.editMode.set(false);
    }
  }

  /** Swipe-to-delete for a single row (outside edit mode). */
  async deleteOne(n: AppNotification): Promise<void> {
    if (n.id) {
      await this.inbox.remove([n.id]);
    }
  }
}
