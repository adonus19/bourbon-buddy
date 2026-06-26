import { Component, computed, input } from '@angular/core';

import { WishlistEntry } from '../../../models';
import {
  PRIORITY_DISPLAY,
  STATUS_DISPLAY,
} from '../../constants/wishlist-display';

/** Hunt List card. Presentational; the parent wires navigation on the host. */
@Component({
  selector: 'app-wishlist-card',
  templateUrl: './wishlist-card.component.html',
  styleUrls: ['./wishlist-card.component.scss'],
  standalone: false,
})
export class WishlistCardComponent {
  readonly entry = input.required<WishlistEntry>();

  readonly priority = computed(() => PRIORITY_DISPLAY[this.entry().priority]);
  readonly statusLabel = computed(
    () => STATUS_DISPLAY[this.entry().status] ?? ''
  );

  /** MSRP-vs-best-price delta, e.g. "+14%" (above) or "-5%" (below). */
  readonly delta = computed(() => {
    const e = this.entry();
    if (e.msrp == null || e.msrp <= 0 || e.bestSightingPrice == null) {
      return null;
    }
    const pct = Math.round(((e.bestSightingPrice - e.msrp) / e.msrp) * 100);
    return {
      text: `${pct >= 0 ? '+' : ''}${pct}%`,
      below: pct < 0,
    };
  });
}
