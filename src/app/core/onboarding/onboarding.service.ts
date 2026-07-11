import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { GUIDED_TOUR } from './tour.config';
import {
  ActivePresentation,
  ContextualTip,
  TourStep,
} from './onboarding.types';

/** localStorage namespace so all onboarding flags cluster together. */
const NS = 'bb.onboarding';
const FIRST_RUN_KEY = `${NS}.firstRunDone`;
const TIP_PREFIX = `${NS}.tip.`;

/** How long to wait for a step's anchor to mount after navigation. */
const ANCHOR_TIMEOUT_MS = 1500;
const ANCHOR_POLL_MS = 50;

/**
 * Drives the guided walkthrough and one-off contextual tips.
 *
 * State-holder pattern like the rest of the app: a root singleton exposing
 * readonly signals; components read `active()` and render the shared overlay.
 * There is **no** Firestore access here — "seen" flags live in localStorage
 * (per-device, zero read/write cost), consistent with the welcome splash.
 *
 * Anchors are registered by the `bbTourAnchor` directive; the service resolves
 * a step's target element on demand so the overlay can spotlight real UI.
 */
@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private readonly router = inject(Router);

  /** key → live DOM element, populated by TourAnchorDirective. */
  private readonly anchors = new Map<string, HTMLElement>();

  private readonly _active = signal<ActivePresentation | null>(null);
  /** What the overlay should render right now (or null to render nothing). */
  readonly active = this._active.asReadonly();
  readonly isActive = computed(() => this._active() !== null);

  private steps: readonly TourStep[] = GUIDED_TOUR;
  private currentIndex = 0;
  /** Travel direction, so a skipped (missing-anchor) step advances the right way. */
  private direction: 1 | -1 = 1;

  // --- Anchor registry (called by the directive) --------------------------

  registerAnchor(key: string, el: HTMLElement): void {
    this.anchors.set(key, el);
  }

  unregisterAnchor(key: string, el: HTMLElement): void {
    // Only clear if the current registration is this element — guards against a
    // remount registering the new node before the old one tears down.
    if (this.anchors.get(key) === el) {
      this.anchors.delete(key);
    }
  }

  /** The live element for a step's anchor, if currently mounted. */
  getAnchorElement(key: string | undefined): HTMLElement | undefined {
    return key ? this.anchors.get(key) : undefined;
  }

  // --- First-run trigger --------------------------------------------------

  /**
   * Start the tour the first time the user reaches the app shell. Safe to call
   * on every TabsPage init — it no-ops once the tour has been completed or
   * skipped, or if something is already showing.
   */
  maybeStartFirstRun(): void {
    if (this.isActive() || this.getFlag(FIRST_RUN_KEY)) {
      return;
    }
    this.startTour();
  }

  // --- Guided tour --------------------------------------------------------

  /** Start (or restart) the guided tour from the top. */
  startTour(): void {
    this.steps = GUIDED_TOUR;
    this.direction = 1;
    void this.show(0);
  }

  next(): void {
    if (this._active()?.kind !== 'tour') {
      return;
    }
    this.direction = 1;
    void this.show(this.currentIndex + 1);
  }

  back(): void {
    if (this._active()?.kind !== 'tour' || this.currentIndex === 0) {
      return;
    }
    this.direction = -1;
    void this.show(this.currentIndex - 1);
  }

  /** Abandon the tour early. Counts as "seen" so it won't auto-run again. */
  skip(): void {
    this.setFlag(FIRST_RUN_KEY);
    this._active.set(null);
  }

  private async show(index: number): Promise<void> {
    if (index >= this.steps.length) {
      this.complete();
      return;
    }
    if (index < 0) {
      return;
    }

    const step = this.steps[index];
    this.currentIndex = index;

    if (step.route) {
      await this.ensureRoute(step.route);
    }

    if (step.anchor) {
      const el = await this.waitForAnchor(step.anchor);
      // A required anchor that never mounts (e.g. Cellar segments on an empty
      // account) means the step isn't relevant — skip it in travel direction.
      if (!el && step.requiresAnchor) {
        await this.show(index + this.direction);
        return;
      }
    }

    this._active.set({
      kind: 'tour',
      step,
      index,
      total: this.steps.length,
    });
  }

  private complete(): void {
    this.setFlag(FIRST_RUN_KEY);
    this._active.set(null);
  }

  // --- Contextual tips (used in Pass 2) -----------------------------------

  /**
   * Show a one-off tip, at most once per device. No-ops if a tour/tip is
   * already showing or this tip has been seen. Marks it seen immediately so a
   * navigation-away can't cause it to re-fire.
   */
  async showTipOnce(tip: ContextualTip): Promise<void> {
    if (this.isActive() || this.getFlag(TIP_PREFIX + tip.key)) {
      return;
    }
    if (tip.anchor) {
      const el = await this.waitForAnchor(tip.anchor);
      if (!el) {
        return; // nothing to point at; don't burn the "seen" flag
      }
    }
    this.setFlag(TIP_PREFIX + tip.key);
    this._active.set({ kind: 'tip', step: tip, index: -1, total: 1 });
  }

  /** Dismiss the active contextual tip. */
  dismissTip(): void {
    if (this._active()?.kind === 'tip') {
      this._active.set(null);
    }
  }

  /** Test/support hook: forget every "seen" flag so onboarding runs fresh. */
  resetAll(): void {
    if (!this.hasStorage()) {
      return;
    }
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(NS)) {
        localStorage.removeItem(k);
      }
    }
  }

  // --- Internals ----------------------------------------------------------

  private async ensureRoute(route: string): Promise<void> {
    // url includes query/fragment; compare the path prefix.
    if (this.router.url.split('?')[0] === route) {
      return;
    }
    await this.router.navigateByUrl(route);
  }

  private waitForAnchor(key: string): Promise<HTMLElement | undefined> {
    return new Promise((resolve) => {
      const existing = this.anchors.get(key);
      if (existing) {
        resolve(existing);
        return;
      }
      let waited = 0;
      const timer = setInterval(() => {
        const el = this.anchors.get(key);
        if (el || waited >= ANCHOR_TIMEOUT_MS) {
          clearInterval(timer);
          resolve(el);
        }
        waited += ANCHOR_POLL_MS;
      }, ANCHOR_POLL_MS);
    });
  }

  private hasStorage(): boolean {
    return typeof window !== 'undefined' && !!window.localStorage;
  }

  private getFlag(key: string): boolean {
    return this.hasStorage() && localStorage.getItem(key) === '1';
  }

  private setFlag(key: string): void {
    if (this.hasStorage()) {
      localStorage.setItem(key, '1');
    }
  }
}
