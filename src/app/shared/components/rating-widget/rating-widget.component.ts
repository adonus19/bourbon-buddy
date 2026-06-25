import { Component, computed, input, output } from '@angular/core';

let widgetInstanceCounter = 0;

// Glencairn glass artwork (Henry Chung / Noun Project, see
// src/assets/glencairn-glass.svg). The path data is inlined here because an
// external <img> SVG can't be clip-filled per glass for the rating animation.
const VIEW_BOX = { x: 30, y: 15, w: 40, h: 70 };

// Solid outer contour of the glass body — used as the liquid silhouette so
// amber fills the bowl interior (not just the outline).
const BODY_PATH =
  'M67.2,51.8c0-2.3-0.9-4.9-1.8-7.3c-0.3-0.9-0.6-1.7-0.8-2.5l-0.1-0.5c-0.8-2.8-2.5-8.6-2.5-18.4v-1.5H38.1v1.5c0,9.7-1.7,15.6-2.5,18.4l-0.1,0.5c-0.2,0.7-0.5,1.6-0.8,2.5c-0.8,2.4-1.8,5-1.8,7.3c0,5.7,2.8,11,7.6,14.2c0.5,0.3,1,0.6,1.5,0.9l-3.2,7.9c-0.3,0.8-0.2,1.6,0.2,2.3c0.5,0.7,1.2,1.1,2.1,1.1H59c0.8,0,1.6-0.4,2.1-1.1c0.5-0.7,0.6-1.6,0.2-2.3L58.1,67c0.5-0.3,1-0.6,1.5-0.9C64.3,62.8,67.2,57.5,67.2,51.8z';

// Full glass linework (walls + foot + highlight) drawn on top of the liquid.
const OUTLINE_PATHS = [
  'M67.2,51.8c0-2.3-0.9-4.9-1.8-7.3c-0.3-0.9-0.6-1.7-0.8-2.5l-0.1-0.5c-0.8-2.8-2.5-8.6-2.5-18.4v-1.5H38.1v1.5c0,9.7-1.7,15.6-2.5,18.4l-0.1,0.5c-0.2,0.7-0.5,1.6-0.8,2.5c-0.8,2.4-1.8,5-1.8,7.3c0,5.7,2.8,11,7.6,14.2c0.5,0.3,1,0.6,1.5,0.9l-3.2,7.9c-0.3,0.8-0.2,1.6,0.2,2.3c0.5,0.7,1.2,1.1,2.1,1.1H59c0.8,0,1.6-0.4,2.1-1.1c0.5-0.7,0.6-1.6,0.2-2.3L58.1,67c0.5-0.3,1-0.6,1.5-0.9C64.3,62.8,67.2,57.5,67.2,51.8z M58.2,75.3H41.8l1.9-4.8h12.5L58.2,75.3z M57.9,63.6c-0.5,0.3-1,0.6-1.6,0.9c-1.1,0.6-1.7,1.8-1.3,3H44.9c0.4-1.2-0.1-2.4-1.3-3c-0.5-0.3-1.1-0.6-1.6-0.9c-3.9-2.6-6.2-7-6.2-11.7c0-1.8,0.8-4.2,1.6-6.3c0.3-0.9,0.6-1.8,0.9-2.6l0.1-0.5c0.8-2.8,2.4-8.4,2.6-17.7H59c0.2,9.3,1.8,14.9,2.6,17.7l0.1,0.5c0.2,0.8,0.5,1.7,0.9,2.6c0.7,2.1,1.6,4.5,1.6,6.3C64.2,56.5,61.8,60.9,57.9,63.6z',
  'M45.5,27.7c-0.8-0.1-1.5,0.6-1.6,1.4C43.3,36.3,42,41,41.3,43.2l-0.1,0.5c-0.3,0.9-0.6,1.8-0.9,2.8c-0.3,0.8,0.1,1.6,0.9,1.9c0.2,0.1,0.3,0.1,0.5,0.1c0.6,0,1.2-0.4,1.4-1c0.4-1,0.7-2,1-3l0.1-0.5c0.7-2.4,2.1-7.3,2.6-14.8C46.9,28.5,46.3,27.7,45.5,27.7z',
];

/**
 * Five Glencairn glasses that fill bottom-to-top with amber based on the
 * rating (half-fill = half a star). Display mode renders static fills; in
 * interactive mode tapping a glass sets its position, and tapping a glass that
 * is already full drops it to a half-fill (per the UI/UX brief).
 *
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
  /** Glass height in px; width follows the glass aspect ratio. */
  readonly size = input<number>(28);

  readonly ratingChange = output<number>();

  readonly glasses = [0, 1, 2, 3, 4];
  readonly uid = `rw${widgetInstanceCounter++}`;
  readonly viewBox = `${VIEW_BOX.x} ${VIEW_BOX.y} ${VIEW_BOX.w} ${VIEW_BOX.h}`;
  readonly vb = VIEW_BOX;
  readonly bodyPath = BODY_PATH;
  readonly outlinePaths = OUTLINE_PATHS;

  readonly glassWidth = computed(() =>
    Math.round(this.size() * (VIEW_BOX.w / VIEW_BOX.h))
  );

  /** Fill fraction (0, 0.5, 1) for the glass at index i. */
  readonly fillFractions = computed(() => {
    const r = this.rating() ?? 0;
    return this.glasses.map((i) => Math.min(1, Math.max(0, r - i)));
  });

  clipId(i: number): string {
    return `${this.uid}-clip-${i}`;
  }

  fillY(i: number): number {
    return this.vb.y + this.vb.h * (1 - this.fillFractions()[i]);
  }

  fillHeight(i: number): number {
    return this.vb.h * this.fillFractions()[i];
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
