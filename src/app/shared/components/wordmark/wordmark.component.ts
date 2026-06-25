import { Component, Input } from '@angular/core';

/**
 * The "Bourbon Buddy" wordmark. The weight contrast within one typeface —
 * "Bourbon" bold, "Buddy" italic — carries the dual personality: serious
 * bourbon, friendly buddy. Size scales via the [size] input (px for the
 * base font-size).
 */
@Component({
  selector: 'app-wordmark',
  templateUrl: './wordmark.component.html',
  styleUrls: ['./wordmark.component.scss'],
  standalone: false,
})
export class WordmarkComponent {
  @Input() size = 28;
}
