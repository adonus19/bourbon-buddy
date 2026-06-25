import { Component, computed, input, output } from '@angular/core';

let widgetInstanceCounter = 0;

/**
 * Five Glencairn-glass outlines that fill bottom-to-top with amber based on the
 * rating (half-fill = half a star). Display mode renders static fills; in
 * interactive mode tapping a glass sets its position, and tapping a glass that
 * is already full drops it to a half-fill (per the UI/UX brief).
 *
 * Usage (input/output, no ControlValueAccessor so it works the same in cards,
 * detail views, and forms):
 *   <app-rating-widget [rating]="entry.rating"></app-rating-widget>
 *   <app-rating-widget [rating]="value" [interactive]="true"
 *                      (ratingChange)="value = $event"></app-rating-widget>
 */
@Component({
  selector: 'app-rating-widget',
  templateUrl: './rating-widget.component.html',
  styleUrls: ['./rating-widget.component.scss'],
  standalone: false,
})
export class RatingWidgetComponent {
  readonly rating = input<number | null>(null);
  readonly interactive = input<boolean>(false);
  /** Per-glass size in px. */
  readonly size = input<number>(28);

  readonly ratingChange = output<number>();

  readonly glasses = [0, 1, 2, 3, 4];
  readonly uid = `rw${widgetInstanceCounter++}`;

  /** Fill fraction (0, 0.5, 1) for the glass at index i. */
  readonly fillFractions = computed(() => {
    const r = this.rating() ?? 0;
    return this.glasses.map((i) => Math.min(1, Math.max(0, r - i)));
  });

  clipId(i: number): string {
    return `${this.uid}-clip-${i}`;
  }

  onGlassClick(i: number): void {
    if (!this.interactive()) {
      return;
    }
    const current = this.rating() ?? 0;
    // Tapping the already-full glass drops it to a half; otherwise fill it.
    const next = current === i + 1 ? i + 0.5 : i + 1;
    this.ratingChange.emit(next);
  }
}
