import {
  Component,
  HostListener,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

import { OnboardingService } from '../../../core/onboarding/onboarding.service';
import { TipPlacement } from '../../../core/onboarding/onboarding.types';

interface SpotRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * The single overlay that renders the guided walkthrough and one-off tips.
 * Mounted once at the app root so it can spotlight elements on any route.
 *
 * It reads {@link OnboardingService.active} and, for anchored steps, measures
 * the registered element to draw a "cut-out" spotlight (a transparent box with
 * a huge box-shadow acting as the scrim) plus a glass tooltip bubble. Centered
 * steps skip the cut-out and float a card in the middle.
 */
@Component({
  selector: 'app-onboarding-overlay',
  templateUrl: './onboarding-overlay.component.html',
  styleUrls: ['./onboarding-overlay.component.scss'],
  standalone: false,
})
export class OnboardingOverlayComponent {
  private readonly onboarding = inject(OnboardingService);

  readonly active = this.onboarding.active;

  /** Spotlight geometry in viewport coords, or null for a centered card. */
  readonly spotlight = signal<SpotRect | null>(null);
  /** Resolved bubble placement (never `auto` after measuring). */
  readonly placement = signal<Exclude<TipPlacement, 'auto'>>('center');

  private readonly onReflow = () => this.measure();

  constructor() {
    // Re-measure whenever the active step changes; the anchor is guaranteed to
    // be mounted by the time the service sets `active`.
    effect(() => {
      const present = this.active();
      this.toggleScrollLock(!!present);
      if (!present) {
        this.spotlight.set(null);
        return;
      }
      // Two frames: let Ionic finish any tab/FAB layout before measuring.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => this.measure())
      );
    });

    window.addEventListener('resize', this.onReflow, true);
    window.addEventListener('scroll', this.onReflow, true);
  }

  /** Inline position for the bubble, derived from the spotlight + placement. */
  readonly bubbleStyle = computed<Record<string, string>>(() => {
    const rect = this.spotlight();
    const place = this.placement();
    const style: Record<string, string> = {};
    if (!rect || place === 'center') {
      return style;
    }
    const gap = 16;
    if (place === 'top') {
      style['bottom'] = `${window.innerHeight - rect.top + gap}px`;
    } else {
      style['top'] = `${rect.top + rect.height + gap}px`;
    }
    return style;
  });

  /** Dot indices for the tour progress row. */
  readonly dots = computed<number[]>(() => {
    const p = this.active();
    return p && p.kind === 'tour'
      ? Array.from({ length: p.total }, (_, i) => i)
      : [];
  });

  private measure(): void {
    const present = this.active();
    if (!present) {
      return;
    }
    const step = present.step as {
      anchor?: string;
      placement?: TipPlacement;
    };
    const el = this.onboarding.getAnchorElement(step.anchor);
    const requested = step.placement ?? 'auto';

    if (!el || requested === 'center') {
      this.spotlight.set(null);
      this.placement.set('center');
      return;
    }

    // Bring anchors inside a scroll container into view before measuring.
    el.scrollIntoView({ block: 'center', behavior: 'auto' });
    const r = el.getBoundingClientRect();
    const pad = 8;
    this.spotlight.set({
      top: r.top - pad,
      left: r.left - pad,
      width: r.width + pad * 2,
      height: r.height + pad * 2,
    });

    if (requested === 'top' || requested === 'bottom') {
      this.placement.set(requested);
    } else {
      const centerY = r.top + r.height / 2;
      this.placement.set(centerY < window.innerHeight / 2 ? 'bottom' : 'top');
    }
  }

  private toggleScrollLock(lock: boolean): void {
    if (typeof document !== 'undefined') {
      document.body.style.overflow = lock ? 'hidden' : '';
    }
  }

  // --- Controls -----------------------------------------------------------

  next(): void {
    this.onboarding.next();
  }

  back(): void {
    this.onboarding.back();
  }

  skip(): void {
    this.onboarding.skip();
  }

  dismissTip(): void {
    this.onboarding.dismissTip();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    const p = this.active();
    if (p?.kind === 'tour') {
      this.skip();
    } else if (p?.kind === 'tip') {
      this.dismissTip();
    }
  }
}
