import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';

import { IonicModule, IonicRouteStrategy } from '@ionic/angular';

import {
  getApp,
  initializeApp,
  provideFirebaseApp,
} from '@angular/fire/app';
import {
  initializeAppCheck,
  provideAppCheck,
  ReCaptchaV3Provider,
} from '@angular/fire/app-check';
import {
  connectAuthEmulator,
  getAuth,
  provideAuth,
} from '@angular/fire/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  provideFirestore,
} from '@angular/fire/firestore';
import {
  connectStorageEmulator,
  getStorage,
  provideStorage,
} from '@angular/fire/storage';
import {
  connectFunctionsEmulator,
  getFunctions,
  provideFunctions,
} from '@angular/fire/functions';
import { getMessaging, provideMessaging } from '@angular/fire/messaging';
import { ServiceWorkerModule } from '@angular/service-worker';

import { environment } from '../environments/environment';
import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { OnboardingModule } from './shared/onboarding.module';

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    IonicModule.forRoot(),
    AppRoutingModule,
    // Guided walkthrough overlay lives at the app root so it can spotlight
    // elements on any route (tabs and top-level detail pages alike).
    OnboardingModule,
    // App-shell caching (ngsw): instant repeat-visit paint + offline startup.
    // Registered at scope '/', coexisting with firebase-messaging-sw.js which
    // FCM registers at its own push scope. 'registerWhenStable' keeps SW setup
    // off the critical launch path.
    ServiceWorkerModule.register('ngsw-worker.js', {
      enabled: environment.production,
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    // App Check (BB-121): proves requests come from THIS app before they reach
    // Firestore/Storage/Functions — the anti-abuse gate everything else builds
    // on. Wired only once a reCAPTCHA site key is configured, so the app keeps
    // working during initial setup (see docs/app-check-setup.md).
    ...(environment.recaptchaSiteKey
      ? [
          provideAppCheck(() => {
            // Debug-token mode is keyed off the HOSTNAME, deliberately not
            // environment.production: a deployed build made from the dev
            // environment config would otherwise silently run App Check in
            // debug mode in production, and every user's unregistered token
            // would be rejected (the 2026-07 outage). Only true local dev
            // mints a debug token — register it under App Check → Apps →
            // Debug tokens (it's logged to the console on first run).
            if (['localhost', '127.0.0.1'].includes(location.hostname)) {
              (
                self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }
              ).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
            }
            return initializeAppCheck(getApp(), {
              provider: new ReCaptchaV3Provider(environment.recaptchaSiteKey),
              isTokenAutoRefreshEnabled: true,
            });
          }),
        ]
      : []),
    provideAuth(() => {
      const auth = getAuth();
      if (environment.useEmulators) {
        const { host, port } = environment.emulators.auth;
        connectAuthEmulator(auth, `http://${host}:${port}`, {
          disableWarnings: true,
        });
      }
      return auth;
    }),
    provideFirestore(() => {
      // Offline persistence: an IndexedDB-backed cache so the app works without
      // a connection (e.g. in a liquor store with poor signal) and serves reads
      // from cache to cut Firestore cost. Multi-tab manager keeps tabs in sync.
      const firestore = initializeFirestore(getApp(), {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
        // BB-228: Safari blocks the WebChannel backchannel when it rides the
        // Fetch API — "Fetch API cannot load .../Listen/channel ... due to
        // access control checks" — so no realtime listener ever connects and
        // the app renders only what IndexedDB already had.
        //
        // `useFetchStreams` defaults to TRUE in the browser build
        // (`registerFirestore(variant, useFetchStreams = true)`), and
        // `experimentalAutoDetectLongPolling` — already true by default — does
        // NOT rescue this: it detects a *buffering proxy*, not a stream that is
        // refused outright, so it never triggers the fallback. Requests just
        // retry with backoff, which is where the multi-second stalls come from.
        //
        // `useFetchStreams: false` would be the narrower fix but it is not on
        // the public `FirestoreSettings` type (internal to registerFirestore),
        // so the supported escape hatch is forcing long polling — which routes
        // off fetch streams onto XHR as a side effect. Costs some extra
        // requests versus a live stream; correctness beats chattiness here.
        experimentalForceLongPolling: true,
      });
      if (environment.useEmulators) {
        const { host, port } = environment.emulators.firestore;
        connectFirestoreEmulator(firestore, host, port);
      }
      return firestore;
    }),
    provideStorage(() => {
      const storage = getStorage();
      if (environment.useEmulators) {
        const { host, port } = environment.emulators.storage;
        connectStorageEmulator(storage, host, port);
      }
      return storage;
    }),
    provideFunctions(() => {
      const functions = getFunctions();
      if (environment.useEmulators) {
        const { host, port } = environment.emulators.functions;
        connectFunctionsEmulator(functions, host, port);
      }
      return functions;
    }),
    // FCM has no emulator; messaging always targets the live project. The
    // NotificationService guards usage behind isSupported()/permission.
    provideMessaging(() => getMessaging()),
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
