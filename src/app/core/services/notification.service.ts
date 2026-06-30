import { Injectable, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  Messaging,
  deleteToken,
  getToken,
  isSupported,
  onMessage,
} from '@angular/fire/messaging';
import {
  Firestore,
  deleteDoc,
  doc,
  docData,
  serverTimestamp,
  setDoc,
} from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { ToastController } from '@ionic/angular';
import { Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import {
  DEFAULT_NOTIFICATION_PREFS,
  NotificationPrefKey,
  NotificationPrefs,
} from '../../models';

/** Permission state surfaced to the UI. */
export type PushState =
  | 'unsupported' // browser can't do web push
  | 'unconfigured' // no VAPID key set yet
  | 'default' // not yet asked
  | 'denied' // user blocked notifications
  | 'granted'; // enabled, token registered

/** Small stable id for a token so re-registers don't create duplicate docs. */
function hashToken(token: string): string {
  let h = 5381;
  for (let i = 0; i < token.length; i++) {
    h = ((h << 5) + h + token.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}

/**
 * Web-push (FCM) plumbing (BB-090). Owns the single foreground-message listener
 * and the device-token lifecycle: request permission, register the token under
 * `/users/{uid}/fcmTokens/{tokenId}`, and remove it on disable / sign-out.
 * Messaging only works against the live project (no FCM emulator) and only in
 * supporting browsers — all usage is guarded.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly messaging = inject(Messaging);
  private readonly firestore = inject(Firestore);
  private readonly functions = inject(Functions);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastController);

  readonly state = signal<PushState>('default');
  private currentToken: string | null = null;
  private foregroundBound = false;

  /** Live notification preferences for the signed-in user (defaults until set). */
  private readonly prefsDocData = toSignal(
    this.auth.currentUser$.pipe(
      switchMap((user) =>
        user
          ? (docData(this.prefsDoc(user.uid)) as Observable<
              Partial<NotificationPrefs> | undefined
            >)
          : of<Partial<NotificationPrefs> | undefined>(undefined)
      )
    ),
    { initialValue: undefined }
  );

  readonly prefs = computed<NotificationPrefs>(() => ({
    ...DEFAULT_NOTIFICATION_PREFS,
    ...(this.prefsDocData() ?? {}),
  }));

  /** Resolves the initial state (call once, e.g. when opening settings). */
  async refreshState(): Promise<void> {
    if (!environment.vapidKey) {
      this.state.set('unconfigured');
      return;
    }
    if (!(await isSupported()) || typeof Notification === 'undefined') {
      this.state.set('unsupported');
      return;
    }
    this.state.set(Notification.permission as PushState);
  }

  /** Requests permission (if needed) and registers this device's token. */
  async enable(): Promise<PushState> {
    if (!environment.vapidKey) {
      this.state.set('unconfigured');
      return 'unconfigured';
    }
    if (!(await isSupported()) || typeof Notification === 'undefined') {
      this.state.set('unsupported');
      return 'unsupported';
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      this.state.set(permission as PushState);
      return permission as PushState;
    }

    const registration = await navigator.serviceWorker.register(
      '/firebase-messaging-sw.js'
    );
    const token = await getToken(this.messaging, {
      vapidKey: environment.vapidKey,
      serviceWorkerRegistration: registration,
    });

    this.currentToken = token;
    await this.saveToken(token);
    this.bindForeground();
    this.state.set('granted');
    return 'granted';
  }

  /** Removes this device's token (on user opt-out). */
  async disable(): Promise<void> {
    await this.removeCurrentToken();
    this.state.set('default');
  }

  /** Called before sign-out so the signed-out device stops receiving pushes. */
  async cleanupForSignOut(): Promise<void> {
    await this.removeCurrentToken();
  }

  // --- Preferences (BB-091) ---

  /**
   * Flips a single preference. Turning a notification type on while push isn't
   * granted requests permission first (contextual prompt). The preference is
   * still saved either way so it takes effect once push is enabled.
   */
  async setPref(key: NotificationPrefKey, value: boolean): Promise<PushState> {
    let result: PushState = this.state();
    if (value && key !== 'pausedAll' && this.state() !== 'granted') {
      result = await this.enable();
    }
    await this.savePrefs({ [key]: value });
    return result;
  }

  async savePrefs(partial: Partial<NotificationPrefs>): Promise<void> {
    const uid = this.auth.snapshotUser?.uid;
    if (!uid) {
      return;
    }
    await setDoc(
      this.prefsDoc(uid),
      { ...partial, updatedAt: serverTimestamp() },
      { merge: true }
    );
  }

  private prefsDoc(uid: string) {
    return doc(this.firestore, `users/${uid}/settings/notifications`);
  }

  /** Sends a test push to this user via the callable; returns devices reached. */
  async sendTest(): Promise<number> {
    const callable = httpsCallable<unknown, { sent: number }>(
      this.functions,
      'sendTestNotification'
    );
    const res = await callable({});
    return res.data.sent;
  }

  private async saveToken(token: string): Promise<void> {
    const uid = this.auth.snapshotUser?.uid;
    if (!uid) {
      return;
    }
    await setDoc(doc(this.firestore, `users/${uid}/fcmTokens/${hashToken(token)}`), {
      token,
      platform: 'web',
      userAgent: navigator.userAgent,
      updatedAt: serverTimestamp(),
    });
  }

  private async removeCurrentToken(): Promise<void> {
    const uid = this.auth.snapshotUser?.uid;
    try {
      if (this.currentToken && uid) {
        await deleteDoc(
          doc(this.firestore, `users/${uid}/fcmTokens/${hashToken(this.currentToken)}`)
        );
      }
      if (this.currentToken) {
        await deleteToken(this.messaging);
      }
    } catch {
      // Best-effort cleanup; ignore failures (e.g. already gone).
    } finally {
      this.currentToken = null;
    }
  }

  /** Foreground messages don't auto-display — surface them as a toast. */
  private bindForeground(): void {
    if (this.foregroundBound) {
      return;
    }
    this.foregroundBound = true;
    onMessage(this.messaging, (payload) => {
      const title = payload.notification?.title ?? 'Bourbon Buddy';
      const body = payload.notification?.body ?? '';
      void this.toast
        .create({
          header: title,
          message: body,
          duration: 4000,
          position: 'top',
          buttons: [{ text: 'Dismiss', role: 'cancel' }],
        })
        .then((t) => t.present());
    });
  }
}
