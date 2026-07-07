import { Component, inject } from '@angular/core';

import { SightingOutboxService } from '../../../core/services/sighting-outbox.service';

/**
 * Persistent banner showing how many sightings are queued offline and waiting
 * to sync (BB-182). Reads the outbox's `pending` signal — it vanishes on its
 * own once the queue drains (absence = synced). Tap to force a sync attempt.
 */
@Component({
  selector: 'app-offline-sync-badge',
  templateUrl: './offline-sync-badge.component.html',
  styleUrls: ['./offline-sync-badge.component.scss'],
  standalone: false,
})
export class OfflineSyncBadgeComponent {
  private readonly outbox = inject(SightingOutboxService);

  readonly pending = this.outbox.pending;

  retry(): void {
    void this.outbox.flush();
  }
}
