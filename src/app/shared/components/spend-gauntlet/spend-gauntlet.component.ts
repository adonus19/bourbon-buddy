import { Component, Input, OnDestroy, computed, inject, signal } from '@angular/core';
import { ModalController } from '@ionic/angular';

import {
  GAUNTLET_MAX_FAILURES,
  GauntletSources,
  GauntletStage,
  buildGauntletRun,
} from '../../utils/gauntlet';

/**
 * The Discreet Total Spent gauntlet (BB-229c) — self mode only.
 *
 * All seven stages run in order, every reveal. Dismissing mid-run resolves as a
 * cancel, so the next attempt builds a **fresh** run from stage 1; there is
 * deliberately no saved position. Three failures anywhere trip the escape
 * hatch, because being locked out of your own spend by a joke you opted into is
 * the one outcome this must never produce.
 */
@Component({
  selector: 'app-spend-gauntlet',
  templateUrl: './spend-gauntlet.component.html',
  styleUrls: ['./spend-gauntlet.component.scss'],
  standalone: false,
})
export class SpendGauntletComponent implements OnDestroy {
  private readonly modalCtrl = inject(ModalController);

  @Input() sources: GauntletSources = { rated: [], priced: [], radar: [] };

  readonly stages = signal<GauntletStage[]>([]);
  readonly index = signal(0);
  readonly failures = signal(0);
  readonly typed = signal('');
  readonly answer = signal('');
  /** 0–1 progress for the hold stage; seconds remaining for the cooldown. */
  readonly holdProgress = signal(0);
  readonly cooldownLeft = signal(0);
  readonly shake = signal(false);

  private holdTimer?: ReturnType<typeof setInterval>;
  private cooldownTimer?: ReturnType<typeof setInterval>;

  readonly stage = computed<GauntletStage | null>(
    () => this.stages()[this.index()] ?? null
  );
  readonly stepLabel = computed(
    () => `${this.index() + 1} of ${this.stages().length}`
  );
  /** Shown once the user has clearly had enough. */
  readonly bailedOut = computed(
    () => this.failures() >= GAUNTLET_MAX_FAILURES
  );

  ionViewWillEnter(): void {
    this.stages.set(buildGauntletRun(this.sources));
  }

  ngOnDestroy(): void {
    this.clearTimers();
  }

  // ---- stage transitions -------------------------------------------------

  next(): void {
    this.typed.set('');
    this.answer.set('');
    this.holdProgress.set(0);
    this.clearTimers();
    if (this.index() + 1 >= this.stages().length) {
      void this.finish();
      return;
    }
    this.index.update((i) => i + 1);
    if (this.stage()?.kind === 'cooldown') {
      this.startCooldown();
    }
  }

  /** A wrong answer never advances; three of them end the bit entirely. */
  fail(): void {
    this.failures.update((f) => f + 1);
    this.shake.set(true);
    setTimeout(() => this.shake.set(false), 400);
  }

  submitPhrase(): void {
    const s = this.stage();
    if (s?.kind !== 'phrase') {
      return;
    }
    const ok =
      this.typed().trim().toLowerCase() === s.phrase.trim().toLowerCase();
    ok ? this.next() : this.fail();
  }

  submitMath(): void {
    const s = this.stage();
    if (s?.kind !== 'math') {
      return;
    }
    Number(this.answer().trim()) === s.answer ? this.next() : this.fail();
  }

  choose(optionId: string): void {
    const s = this.stage();
    if (s?.kind !== 'pick') {
      return;
    }
    optionId === s.answerId ? this.next() : this.fail();
  }

  // ---- hold + cooldown ---------------------------------------------------

  startHold(): void {
    const s = this.stage();
    if (s?.kind !== 'hold' || this.holdTimer) {
      return;
    }
    const step = 100;
    const total = s.seconds * 1000;
    let elapsed = 0;
    this.holdTimer = setInterval(() => {
      elapsed += step;
      this.holdProgress.set(Math.min(1, elapsed / total));
      if (elapsed >= total) {
        this.next();
      }
    }, step);
  }

  /** Letting go resets the bar — it does not count as a failure. */
  endHold(): void {
    if (!this.holdTimer) {
      return;
    }
    clearInterval(this.holdTimer);
    this.holdTimer = undefined;
    if (this.holdProgress() < 1) {
      this.holdProgress.set(0);
    }
  }

  holdCaption(): string {
    const s = this.stage();
    if (s?.kind !== 'hold' || this.holdProgress() === 0) {
      return '';
    }
    const i = Math.min(
      s.holding.length - 1,
      Math.floor(this.holdProgress() * s.holding.length)
    );
    return s.holding[i];
  }

  private startCooldown(): void {
    const s = this.stage();
    if (s?.kind !== 'cooldown') {
      return;
    }
    this.cooldownLeft.set(s.seconds);
    this.cooldownTimer = setInterval(() => {
      this.cooldownLeft.update((n) => Math.max(0, n - 1));
      if (this.cooldownLeft() === 0) {
        this.clearTimers();
      }
    }, 1000);
  }

  // ---- exits -------------------------------------------------------------

  /** Escape hatch (BB-229d): no jokes, no resistance. */
  async bail(): Promise<void> {
    await this.modalCtrl.dismiss(null, 'revealed');
  }

  async finish(): Promise<void> {
    await this.modalCtrl.dismiss(null, 'revealed');
  }

  /** Dismissing mid-run: the next attempt starts over at stage 1. */
  async giveUp(): Promise<void> {
    await this.modalCtrl.dismiss(null, 'cancel');
  }

  private clearTimers(): void {
    if (this.holdTimer) {
      clearInterval(this.holdTimer);
      this.holdTimer = undefined;
    }
    if (this.cooldownTimer) {
      clearInterval(this.cooldownTimer);
      this.cooldownTimer = undefined;
    }
  }
}
