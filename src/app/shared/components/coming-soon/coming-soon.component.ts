import { Component, Input } from '@angular/core';

/**
 * On-theme placeholder used by feature tabs whose real screens land in later
 * iterations. Keeps the shell navigable and visually consistent.
 */
@Component({
  selector: 'app-coming-soon',
  templateUrl: './coming-soon.component.html',
  styleUrls: ['./coming-soon.component.scss'],
  standalone: false,
})
export class ComingSoonComponent {
  @Input() icon = 'time-outline';
  @Input() title = 'Coming soon';
  @Input() subtitle = '';
}
