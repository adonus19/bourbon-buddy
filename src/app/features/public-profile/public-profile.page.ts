import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { PublicProfile } from '../../models';
import { FriendService } from '../../core/services/friend.service';

/**
 * Read-only public profile (BB-103 tap-through). One keyed getDoc of
 * /publicProfiles/{uid} — the only cross-user-readable view — showing just the
 * public fields (name, handle, region, friend count). Never private data.
 */
@Component({
  selector: 'app-public-profile',
  templateUrl: './public-profile.page.html',
  styleUrls: ['./public-profile.page.scss'],
  standalone: false,
})
export class PublicProfilePage {
  private readonly route = inject(ActivatedRoute);
  private readonly friends = inject(FriendService);

  readonly uid = this.route.snapshot.paramMap.get('id') ?? '';
  readonly loading = signal(true);
  readonly profile = signal<PublicProfile | null>(null);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.profile.set(await this.friends.getPublicProfile(this.uid));
    } finally {
      this.loading.set(false);
    }
  }
}
