/**
 * Types for the guided walkthrough / contextual-tip system.
 *
 * The guided tour is a sequence of {@link TourStep}s driven by
 * `OnboardingService`. A single overlay component ({@link
 * OnboardingOverlayComponent}) renders whichever step is active, spotlighting a
 * real UI element registered via the `bbTourAnchor` directive.
 */

/** Where the tooltip bubble sits relative to a spotlighted anchor. */
export type TipPlacement = 'auto' | 'top' | 'bottom' | 'center';

/**
 * A single step in the guided tour.
 *
 * A step either spotlights a registered anchor (`anchor` set) or renders as a
 * centered card (`anchor` omitted — used for the intro/outro). Steps that
 * spotlight an anchor which never registers (e.g. Value Score with an empty
 * Cellar) are skipped automatically, so the tour degrades gracefully.
 */
export interface TourStep {
  /** Stable id, handy for analytics/debugging. */
  readonly id: string;
  /**
   * Route to be on before this step shows. The engine navigates here first and
   * waits for the anchor to register. Omit to stay on the current route.
   */
  readonly route?: string;
  /** Anchor key registered by a `bbTourAnchor` directive. Omit for a centered card. */
  readonly anchor?: string;
  /** Preferred bubble placement; `auto` picks top/bottom by available space. */
  readonly placement?: TipPlacement;
  /** Short display-face title. */
  readonly title: string;
  /** Body copy (DM Sans). Keep it to a sentence or two. */
  readonly body: string;
  /**
   * If true, the step is only shown when its anchor is present; if the anchor
   * never registers it is silently skipped. Defaults to true for anchored
   * steps. Centered steps always show.
   */
  readonly requiresAnchor?: boolean;
}

/**
 * A one-off contextual tip (Pass 2). Same visual language as a tour step but
 * shown standalone, keyed so it fires at most once per device.
 */
export interface ContextualTip {
  /** localStorage key suffix; must be unique across all tips. */
  readonly key: string;
  readonly anchor?: string;
  readonly placement?: TipPlacement;
  readonly title: string;
  readonly body: string;
}

/** What the overlay is currently presenting, if anything. */
export interface ActivePresentation {
  readonly kind: 'tour' | 'tip';
  readonly step: TourStep | ContextualTip;
  /** 0-based index within the tour; -1 for a standalone tip. */
  readonly index: number;
  /** Total steps in the tour; 1 for a standalone tip. */
  readonly total: number;
}
