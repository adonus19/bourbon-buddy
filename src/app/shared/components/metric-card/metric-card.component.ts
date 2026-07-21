import { Component, input, output } from '@angular/core';

/** Small headline-metric tile: an icon, a big value, and a caption. */
@Component({
  selector: 'app-metric-card',
  templateUrl: './metric-card.component.html',
  styleUrls: ['./metric-card.component.scss'],
  standalone: false,
})
export class MetricCardComponent {
  readonly icon = input<string>('');
  readonly value = input<string>('—');
  readonly label = input<string>('');

  /**
   * Optional corner action (BB-229): an ionicon name enables a small button in
   * the tile's top-right. Kept generic rather than spend-specific so any tile
   * can carry one; the tile itself stays non-interactive when unset.
   */
  readonly actionIcon = input<string>('');
  /** Accessible name for the corner action — required whenever it is shown. */
  readonly actionLabel = input<string>('');
  readonly action = output<void>();
}
