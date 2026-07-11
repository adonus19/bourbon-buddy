import { Directive, ElementRef, Input, OnDestroy, inject } from '@angular/core';

import { OnboardingService } from '../../core/onboarding/onboarding.service';

/**
 * Marks a real UI element as a spotlight target for the guided walkthrough or a
 * contextual tip. Register with a stable key that a tour/tip step references:
 *
 * ```html
 * <ion-tab-button tab="cellar" bbTourAnchor="tab-cellar">…</ion-tab-button>
 * ```
 *
 * The element registers on init and unregisters on destroy, so anchors on
 * lazy-loaded pages appear and disappear with their page — the tour engine
 * waits for the one it needs.
 */
@Directive({
  selector: '[bbTourAnchor]',
  standalone: false,
})
export class TourAnchorDirective implements OnDestroy {
  private readonly onboarding = inject(OnboardingService);
  private readonly host = inject(ElementRef<HTMLElement>);

  private key = '';

  @Input('bbTourAnchor')
  set bbTourAnchor(key: string) {
    if (this.key && this.key !== key) {
      this.onboarding.unregisterAnchor(this.key, this.host.nativeElement);
    }
    this.key = key;
    if (key) {
      this.onboarding.registerAnchor(key, this.host.nativeElement);
    }
  }

  ngOnDestroy(): void {
    if (this.key) {
      this.onboarding.unregisterAnchor(this.key, this.host.nativeElement);
    }
  }
}
