import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  Router,
} from '@angular/router';
import { Subject } from 'rxjs';

jest.mock('@ionic/angular', () => ({ ToastController: class {} }));
jest.mock('@angular/service-worker', () => ({ SwUpdate: class {} }));
jest.mock('@angular/fire/firestore', () => ({
  Firestore: class {},
  Timestamp: { now: jest.fn() },
}));
jest.mock('@angular/fire/auth', () => ({ Auth: class {} }));

import { AppComponent } from './app.component';
import { AppUpdateService } from './core/services/app-update.service';
import { InboxService } from './core/services/inbox.service';

function configure(events: Subject<unknown>): AppComponent {
  TestBed.configureTestingModule({
    declarations: [AppComponent],
    schemas: [NO_ERRORS_SCHEMA],
    providers: [
      { provide: Router, useValue: { events } },
      { provide: InboxService, useValue: { unreadCount: async () => 0 } },
      { provide: AppUpdateService, useValue: { init: () => undefined } },
    ],
  });
  return TestBed.createComponent(AppComponent).componentInstance;
}

describe('AppComponent boot splash', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows the splash until the first completed navigation, then fades it out', () => {
    const events = new Subject<unknown>();
    const app = configure(events);
    expect(app.bootSplashFading()).toBe(false);
    expect(app.bootSplashGone()).toBe(false);

    events.next(new NavigationEnd(1, '/tabs', '/tabs/cellar'));
    expect(app.bootSplashFading()).toBe(true);
    expect(app.bootSplashGone()).toBe(false); // still in the DOM, fading

    jest.runAllTimers();
    expect(app.bootSplashGone()).toBe(true);
  });

  it('ignores a cancelled navigation (guard redirect) — the follow-up completes', () => {
    const events = new Subject<unknown>();
    const app = configure(events);

    // authGuard redirecting '' → '/login' cancels the first navigation.
    events.next(new NavigationCancel(1, '/tabs', 'redirect'));
    expect(app.bootSplashFading()).toBe(false);

    events.next(new NavigationEnd(2, '/login', '/login'));
    expect(app.bootSplashFading()).toBe(true);
  });

  it('drops the splash on a navigation error rather than trapping the user', () => {
    const events = new Subject<unknown>();
    const app = configure(events);

    events.next(new NavigationError(1, '/tabs', new Error('chunk load failed')));
    expect(app.bootSplashFading()).toBe(true);
  });
});
