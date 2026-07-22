import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';

import { BourbonCategory } from '../../models';

/**
 * What a surface passes to share a bottle (BB-230b). Either a resolved
 * `bourbonId` (Cellar/Hunt List) or the raw `bottle` fields (Radar/Dispatch
 * bottles that have none) — the callable findOrCreates the catalog entry so both
 * sides key on the same id. `sharerRating` rides along only when the user opts
 * in; it's their own low-stakes rating, range-validated server-side.
 */
export interface ShareBottleInput {
  toUid: string;
  bourbonId?: string | null;
  bottle?: {
    name: string;
    distillery?: string | null;
    category?: BourbonCategory | null;
  };
  note?: string | null;
  sharerRating?: number | null;
}

/**
 * Friends-only sharing (BB-230). Thin wrapper over the guarded `shareBottle`
 * callable — the client can't write another user's docs, so every share goes
 * through the Admin-SDK function that enforces friends-only reach, blocks, and
 * the daily rate limit.
 */
@Injectable({ providedIn: 'root' })
export class SharingService {
  private readonly functions = inject(Functions);

  async shareBottle(
    input: ShareBottleInput
  ): Promise<{ shareId: string; bourbonId: string }> {
    const callable = httpsCallable<
      ShareBottleInput,
      { shareId: string; bourbonId: string }
    >(this.functions, 'shareBottle');
    const res = await callable(input);
    return res.data;
  }

  /**
   * Share the whole active hunt list with a friend as a frozen snapshot
   * (BB-230d). The snapshot is read server-side, so the client just names the
   * recipient and an optional note.
   */
  async shareList(input: {
    toUid: string;
    note?: string | null;
  }): Promise<{ shareId: string; bottleCount: number }> {
    const callable = httpsCallable<
      { toUid: string; note?: string | null },
      { shareId: string; bottleCount: number }
    >(this.functions, 'shareList');
    const res = await callable(input);
    return res.data;
  }
}
