import { Component, OnInit, inject } from '@angular/core';
import { ToastController } from '@ionic/angular';

import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-notification-settings',
  templateUrl: './notification-settings.page.html',
  styleUrls: ['./notification-settings.page.scss'],
  standalone: false,
})
export class NotificationSettingsPage implements OnInit {
  private readonly notifications = inject(NotificationService);
  private readonly toast = inject(ToastController);

  readonly state = this.notifications.state;
  busy = false;

  async ngOnInit(): Promise<void> {
    await this.notifications.refreshState();
  }

  async enable(): Promise<void> {
    if (this.busy) {
      return;
    }
    this.busy = true;
    try {
      const result = await this.notifications.enable();
      if (result === 'granted') {
        await this.present('Notifications enabled on this device.');
      } else if (result === 'denied') {
        await this.present(
          'Notifications are blocked. Enable them in your browser settings.'
        );
      } else if (result === 'unsupported') {
        await this.present("This browser doesn't support push notifications.");
      } else if (result === 'unconfigured') {
        await this.present('Push isn’t configured yet.');
      }
    } catch {
      await this.present("Couldn't enable notifications. Try again.");
    } finally {
      this.busy = false;
    }
  }

  async disable(): Promise<void> {
    if (this.busy) {
      return;
    }
    this.busy = true;
    try {
      await this.notifications.disable();
      await this.present('Notifications turned off on this device.');
    } finally {
      this.busy = false;
    }
  }

  private async present(message: string): Promise<void> {
    const t = await this.toast.create({
      message,
      duration: 2500,
      position: 'top',
    });
    await t.present();
  }
}
