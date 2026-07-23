import { Component, computed, input } from '@angular/core';

import { FlavorProfile } from '../../../models';
import {
  blendedProfileTags,
  consensusCount,
  marketingOnlyTags,
  orderTagsByWeight,
  profileSourceLabel,
} from '../../utils/flavor-provenance';

type Stage = 'nose' | 'palate' | 'finish';

/**
 * Flavor profile (BB-235) for a bottle's detail surfaces — the shared preview
 * sheet (Dispatch + Radar + Hunt List lookup) and the Hunt List detail page.
 *
 * Purely presentational, like `app-critic-summary`: it takes the `flavorProfile`
 * its parent already loaded with the bourbon doc and derives everything with
 * pure `computed()`s — ZERO reads. It blends the BB-188 community tier in,
 * consensus-weights each stage (×N once two or more sources agree, BB-222), and
 * renders NOTHING when there's no profile or every stage is empty, so a parent
 * can drop it in unconditionally.
 */
@Component({
  selector: 'app-flavor-profile',
  templateUrl: './flavor-profile.component.html',
  styleUrls: ['./flavor-profile.component.scss'],
  standalone: false,
})
export class FlavorProfileComponent {
  /** The catalog bottle's stored profile; null hides the whole block. */
  readonly profile = input<FlavorProfile | null>(null);
  /** Producer "Distillery says …" claims — hidden where they'd add noise. */
  readonly showClaims = input(true);
  /** Section heading (eyebrow). */
  readonly heading = input('Flavor profile');

  /** Arrays with the BB-188 community tier blended in (community-first). */
  readonly blendedTags = computed(() => blendedProfileTags(this.profile()));

  /** Provenance line (BB-222): "Based on N reviews" vs "AI-suggested". */
  readonly sourceLabel = computed(() => profileSourceLabel(this.profile()));

  /** Producer claims no review corroborates — shown apart, never as consensus. */
  readonly claims = computed(() =>
    this.showClaims() ? marketingOnlyTags(this.profile()).slice(0, 6) : []
  );

  /** Only render the block when at least one stage carries tags. */
  readonly hasTags = computed(() => {
    const t = this.blendedTags();
    return t.nose.length + t.palate.length + t.finish.length > 0;
  });

  /**
   * One stage's tags as display text, consensus-weighted (BB-222): ordered by
   * mentions with an ×N marker once two or more sources agree — e.g.
   * "Cherry ×3 · Oak".
   */
  stageDisplay(stage: Stage): string {
    const p = this.profile();
    return orderTagsByWeight(this.blendedTags()[stage], p)
      .map((tag) => {
        const n = consensusCount(p, tag);
        return n >= 2 ? `${tag} ×${n}` : tag;
      })
      .join(' · ');
  }
}
