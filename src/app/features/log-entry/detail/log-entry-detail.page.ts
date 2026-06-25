import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';

import { LogEntry } from '../../../models';
import { LogEntryService } from '../../../core/services/log-entry.service';
import { StorageService } from '../../../core/services/storage.service';
import { AuthService } from '../../../core/auth/auth.service';
import {
  CATEGORY_DISPLAY,
  ENTRY_TYPE_LABELS,
} from '../../../shared/constants/category-display';
import { valueScoreLabel } from '../../../shared/utils/value-score';

@Component({
  selector: 'app-log-entry-detail',
  templateUrl: './log-entry-detail.page.html',
  styleUrls: ['./log-entry-detail.page.scss'],
  standalone: false,
})
export class LogEntryDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly logService = inject(LogEntryService);
  private readonly storage = inject(StorageService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly alertCtrl = inject(AlertController);
  private readonly toast = inject(ToastController);

  // Empty-path child inherits the :id from the parent route; fall back just in case.
  readonly entryId =
    this.route.snapshot.paramMap.get('id') ??
    this.route.snapshot.parent?.paramMap.get('id') ??
    '';

  /** Reads from the already-loaded entries signal — no extra Firestore read. */
  readonly entry = this.logService.selectById(this.entryId);

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
