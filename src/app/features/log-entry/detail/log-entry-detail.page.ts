import { Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import {
  ActionSheetController,
  AlertController,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { Timestamp } from '@angular/fire/firestore';

import { LogEntry, PourSession } from '../../../models';
import { LogEntryService } from '../../../core/services/log-entry.service';
import { StorageService } from '../../../core/services/storage.service';
import {
  PourSessionInput,
  PourSessionService,
} from '../../../core/services/pour-session.service';
import { AuthService } from '../../../core/auth/auth.service';
import {
  CATEGORY_DISPLAY,
  ENTRY_TYPE_LABELS,
} from '../../../shared/constants/category-display';
import { valueScoreLabel } from '../../../shared/utils/value-score';
import {
  deriveBottleStatus,
  isOwnedBottle,
  timeToKillDays,
} from '../../../shared/utils/bottle-lifecycle';
import { PourFormComponent } from '../../../shared/components/pour-form/pour-form.component';
import { OnboardingService } from '../../../core/onboarding/onboarding.service';
import { TIPS } from '../../../core/onboarding/tips.config';

@Component({
  selector: 'app-log-entry-detail',
  templateUrl: './log-entry-detail.page.html',
  styleUrls: ['./log-entry-detail.page.scss'],
  standalone: false,
})
export class LogEntryDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly logService = inject(LogEntryService);
  private readonly pourService = inject(PourSessionService);
  private readonly storage = inject(StorageService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly alertCtrl = inject(AlertController);
  private readonly actionSheet = inject(ActionSheetController);
  private readonly modalCtrl = inject(ModalController);
  private readonly toast = inject(ToastController);
  private readonly onboarding = inject(OnboardingService);

  /** Guards the one-shot tip fire against the effect re-running. */
  private firedTipsFor: string | undefined = undefined;

  // Surface the relevant just-in-time tips once the entry loads. showTipOnce
  // is idempotent and one-per-visit, so a single-barrel purchased bottle shows
  // its tips across visits rather than stacking them on one screen.
  private readonly tipsEffect = effect(() => {
    const e = this.entry();
    if (!e || !e.id || this.firedTipsFor === e.id) {
      return;
    }
    this.firedTipsFor = e.id;
    // Defer so the anchored sections have rendered before we measure them.
    setTimeout(() => void this.fireDetailTips(), 500);
  });

  readonly remainingOptions = [
    { value: 100, label: 'Full' },
    { value: 75, label: 'Three-quarters' },
    { value: 50, label: 'Half' },
    { value: 25, label: 'One-quarter' },
    { value: 0, label: 'Empty' },
  ];

  // Empty-path child inherits the :id from the parent route; fall back just in case.
  readonly entryId =
    this.route.snapshot.paramMap.get('id') ??
    this.route.snapshot.parent?.paramMap.get('id') ??
    '';

  /** Reads from the already-loaded entries signal — no extra Firestore read. */
  readonly entry = this.logService.selectById(this.entryId);

  readonly isPurchasedBottle = computed(
    () => this.entry()?.entryType === 'bottle_purchased'
  );

  /** Owned bottles (purchased or gifted) carry the fill-level / kill lifecycle. */
  readonly ownedBottle = computed(() => {
    const e = this.entry();
    return e ? isOwnedBottle(e) : false;
  });
  readonly isKilled = computed(() => {
    const e = this.entry();
    return e ? deriveBottleStatus(e) === 'finished' : false;
  });
  readonly timeToKill = computed(() => {
    const e = this.entry();
    return e ? timeToKillDays(e) : null;
  });

  // One pour-sessions listener for the viewed entry (oldest first).
  readonly pours = toSignal(this.pourService.sessionsFor(this.entryId), {
    initialValue: [] as PourSession[],
  });
  readonly averagePourRating = computed(() => {
    const rated = this.pours().filter((p) => p.rating != null);
    if (!rated.length) {
      return null;
    }
    const sum = rated.reduce((acc, p) => acc + (p.rating ?? 0), 0);
    return Math.round((sum / rated.length) * 10) / 10;
  });

  remainingLabel(pct: number | null | undefined): string {
    if (pct == null) {
      return 'Set level';
    }
    return this.remainingOptions.find((o) => o.value === pct)?.label ?? `${pct}%`;
  }

  readonly categoryLabel = computed(() => {
    const e = this.entry();
    return e ? CATEGORY_DISPLAY[e.category]?.label ?? '' : '';
  });
  readonly accent = computed(() => {
    const e = this.entry();
    return e ? CATEGORY_DISPLAY[e.category]?.accentVar ?? 'var(--color-cat-other)' : '';
  });
  readonly entryTypeLabel = computed(() => {
    const e = this.entry();
    return e ? ENTRY_TYPE_LABELS[e.entryType] ?? '' : '';
  });
  readonly scoreLabel = computed(() => {
    const s = this.entry()?.valueScore;
    return s != null ? valueScoreLabel(s) : '';
  });

  readonly hasTastingNotes = computed(() => {
    const e = this.entry();
    if (!e) {
      return false;
    }
    return (
      e.rating != null ||
      e.noseTags.length > 0 ||
      e.palateTags.length > 0 ||
      e.finishTags.length > 0 ||
      !!e.noseNotes ||
      !!e.palateNotes ||
      !!e.finishNotes
    );
  });

  readonly hasBottleDetails = computed(() => {
    const e = this.entry();
    if (!e) {
      return false;
    }
    return (
      e.isNas ||
      e.ageStatement != null ||
      e.proof != null ||
      this.mashBill(e).length > 0 ||
      !!e.batchNumber ||
      !!e.barrelNumber ||
      !!e.barrelLabel ||
      !!e.series
    );
  });

  /** Present mash-bill parts as "Corn 70%" strings. */
  mashBill(e: LogEntry): string[] {
    const parts: [string, number | null | undefined][] = [
      ['Corn', e.mashBillCorn],
      ['Rye', e.mashBillRye],
      ['Wheat', e.mashBillWheat],
      ['Malt', e.mashBillMalt],
    ];
    return parts
      .filter(([, v]) => v != null)
      .map(([label, v]) => `${label} ${v}%`);
  }

  ageLabel(e: LogEntry): string {
    if (e.isNas) {
      return 'NAS';
    }
    return e.ageStatement != null ? `${e.ageStatement} yr` : '';
  }

  /**
   * Fire the bottle-detail tips in priority order. Awaiting serializes them so
   * the overlay's "one active at a time" guard shows the most specific tip this
   * visit; the rest surface on later visits.
   */
  private async fireDetailTips(): Promise<void> {
    const e = this.entry();
    if (!e) {
      return;
    }
    const isSingleBarrel =
      e.subType === 'single_barrel' || !!e.barrelLabel || !!e.barrelNumber;
    if (isSingleBarrel) {
      await this.onboarding.showTipOnce(TIPS.barrelVariance);
    }
    await this.onboarding.showTipOnce(TIPS.bottleHistory);
    if (this.isPurchasedBottle()) {
      await this.onboarding.showTipOnce(TIPS.pours);
    }
  }

  async openPourForm(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: PourFormComponent,
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role !== 'save' || !data) {
      return;
    }
    const input: PourSessionInput = {
      pourDate: Timestamp.fromDate(new Date(data.pourDate)),
      rating: data.rating ?? null,
      settingNotes: (data.settingNotes ?? '').trim() || null,
      tastingNotes: (data.tastingNotes ?? '').trim() || null,
    };
    try {
      await this.pourService.add(this.entryId, input);
      await this.presentToast('Dram logged. Sláinte.');
    } catch {
      await this.presentToast("Couldn't save the pour. Try again.");
    }
  }

  async removePour(p: PourSession): Promise<void> {
    if (p.id) {
      await this.pourService.remove(this.entryId, p.id);
    }
  }

  async changeBottleRemaining(): Promise<void> {
    const sheet = await this.actionSheet.create({
      header: 'Bottle remaining',
      buttons: [
        ...this.remainingOptions.map((o) => ({
          text: o.label,
          handler: () => {
            void this.applyRemaining(o.value);
          },
        })),
        { text: 'Cancel', role: 'cancel' as const },
      ],
    });
    await sheet.present();
  }

  /** Route a remaining-level choice: Empty → kill; a level on a dead bottle → reopen. */
  private async applyRemaining(pct: number): Promise<void> {
    if (pct === 0) {
      await this.confirmKill();
      return;
    }
    if (this.isKilled()) {
      await this.reopen(pct);
      return;
    }
    await this.logService.setBottleRemaining(this.entryId, pct);
  }

  async confirmKill(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Kill this bottle? 🪦',
      message: 'It moves to your Graveyard — your rating and notes stay put.',
      buttons: [
        { text: 'Not yet', role: 'cancel' },
        {
          text: 'Kill it',
          role: 'destructive',
          handler: () => {
            void this.doKill();
          },
        },
      ],
    });
    await alert.present();
  }

  private async doKill(): Promise<void> {
    try {
      await this.logService.killBottle(this.entryId);
      await this.presentToast('Bottle killed. 🪦');
    } catch {
      await this.presentToast("Couldn't update. Try again.");
    }
  }

  /** Bring a killed bottle back to the Shelf. `pct` sets the restored fill level. */
  async reopen(pct: number | null = null): Promise<void> {
    try {
      await this.logService.reopenBottle(this.entryId, pct);
      await this.presentToast('Back on the shelf.');
    } catch {
      await this.presentToast("Couldn't update. Try again.");
    }
  }

  async confirmDelete(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Delete this entry?',
      message: this.entry()?.bourbonName,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: () => {
            void this.doDelete();
          },
        },
      ],
    });
    await alert.present();
  }

  private async doDelete(): Promise<void> {
    try {
      const uid = this.auth.snapshotUser?.uid;
      if (uid) {
        await this.storage.deleteLabel(uid, this.entryId);
      }
      await this.logService.remove(this.entryId);
      await this.presentToast('Removed.');
      await this.router.navigateByUrl('/tabs/cellar', { replaceUrl: true });
    } catch {
      await this.presentToast("Couldn't delete. Try again.");
    }
  }

  private async presentToast(message: string): Promise<void> {
    const t = await this.toast.create({
      message,
      duration: 2000,
      position: 'top',
    });
    await t.present();
  }
}
