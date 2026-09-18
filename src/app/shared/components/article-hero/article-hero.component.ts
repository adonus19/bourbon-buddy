import { Component, computed, input, linkedSignal } from '@angular/core';

/**
 * Hero image above a Dispatch feed article (BB-238), Google-Discover style.
 *
 * Renders nothing at all when there's no image OR when the one we have fails
 * to load, so a card without a usable image falls back to exactly the
 * text-only layout rather than showing a broken-image glyph or a blank gap.
 *
 * Feed heroes are unresized originals straight from the publisher (one
 * measured at ~980KB), so the <img> lazy-loads: in a long feed only the cards
 * near the viewport ever cost a download.
 */
@Component({
  selector: 'app-article-hero',
  templateUrl: './article-hero.component.html',
  styleUrls: ['./article-hero.component.scss'],
  standalone: false,
})
export class ArticleHeroComponent {
  /** Publisher hero URL; null/absent on articles whose source supplied none. */
  readonly src = input<string | null | undefined>(null);

  /**
   * Set when the browser can't load `src` (404, dead host, hotlink block).
   * linkedSignal so it clears whenever the URL changes — @for recycles these
   * hosts as the feed scrolls, and a sticky failure would blank out the
   * unrelated article that next occupies the same DOM node.
   */
  readonly failed = linkedSignal<string | null | undefined, boolean>({
    source: this.src,
    computation: () => false,
  });

  readonly show = computed(() => !!this.src() && !this.failed());
}
