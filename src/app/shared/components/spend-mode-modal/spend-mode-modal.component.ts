import { Component, inject } from '@angular/core';
import { ModalController } from '@ionic/angular';

import { SpendPrivacyMode } from '../../../models';

interface ModeChoice {
  mode: SpendPrivacyMode;
  label: string;
  hint: string;
}

/**
 * "Who are we hiding this from?" (BB-229b) — shown the FIRST time a user hides
 * their total spent, and only then.
 *
 * The joke lives in the hints rather than the labels, deliberately: the labels
 * have to work for whoever is holding the phone, and an option written as "your
 * wife" excludes a good share of users while landing no better.
 *
 * Dismissing without choosing cancels the hide outright rather than defaulting
 * a mode — `self` costs a minute per reveal, and nobody should land in it by
 * closing a sheet.
 */
@Component({
  selector: 'app-spend-mode-modal',
  templateUrl: './spend-mode-modal.component.html',
  styleUrls: ['./spend-mode-modal.component.scss'],
  standalone: false,
})
export class SpendModeModalComponent {
  private readonly modalCtrl = inject(ModalController);

  readonly choices: ModeChoice[] = [
    {
      mode: 'partner',
      label: 'Someone I live with',
      hint: 'Quick to hide, quick to check. No questions asked.',
    },
    {
      mode: 'self',
      label: "Me. I don't want to know.",
      // States the real cost up front — this is a minute per reveal, and a
      // user who picks it as a gag and resents it daily is a worse outcome
      // than one who never picks it.
      hint: "Then we'll make you work for it. All seven stages, every time.",
    },
    {
      mode: 'plain',
      label: 'Nobody in particular',
      hint: 'Just hide the number. No theatrics.',
    },
  ];

  async choose(mode: SpendPrivacyMode): Promise<void> {
    await this.modalCtrl.dismiss(mode, 'chosen');
  }

  async cancel(): Promise<void> {
    await this.modalCtrl.dismiss(null, 'cancel');
  }
}
