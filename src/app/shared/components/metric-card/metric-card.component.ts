import { Component, input } from '@angular/core';

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
}
