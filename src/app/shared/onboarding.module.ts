import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { OnboardingOverlayComponent } from './components/onboarding-overlay/onboarding-overlay.component';
import { TourAnchorDirective } from './directives/tour-anchor.directive';

/**
 * Guided-walkthrough UI: the `bbTourAnchor` directive (marks spotlight targets)
 * and the single overlay that renders tour steps / contextual tips.
 *
 * Deliberately tiny and Ionic-free so it can be imported by the eager AppModule
 * (for the app-root overlay) without dragging the heavier SharedModule into the
 * initial bundle. SharedModule re-exports it so every feature template can use
 * `bbTourAnchor`.
 */
@NgModule({
  declarations: [OnboardingOverlayComponent, TourAnchorDirective],
  imports: [CommonModule],
  exports: [OnboardingOverlayComponent, TourAnchorDirective],
})
export class OnboardingModule {}
