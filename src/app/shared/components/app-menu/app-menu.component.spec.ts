import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

jest.mock('@ionic/angular', () => ({ MenuController: class {} }));

import { WishlistEntry } from '../../../models';
import { AppMenuService } from '../../../core/services/app-menu.service';
import { InboxService } from '../../../core/services/inbox.service';
import { WishlistService } from '../../../core/services/wishlist.service';
import { AppMenuComponent } from './app-menu.component';

const entry = (over: Partial<WishlistEntry> = {}): WishlistEntry =>
  ({ id: 'w1', bourbonName: 'Weller 12', status: 'actively_looking', ...over } as WishlistEntry);

describe('AppMenuComponent (BB-247)', () => {
  let component: AppMenuComponent;
  let router: { navigate: jest.Mock };
  let appMenu: { close: jest.Mock; setOpen: jest.Mock; isOpen: () => boolean };
  const entries = signal<WishlistEntry[]>([]);
  const unread = signal(0);

  beforeEach(() => {
    entries.set([]);
    unread.set(0);
    router = { navigate: jest.fn().mockResolvedValue(true) };
    appMenu = {
      close: jest.fn().mockResolvedValue(undefined),
      setOpen: jest.fn(),
      isOpen: () => false,
    };

    TestBed.configureTestingModule({
      declarations: [AppMenuComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: Router, useValue: router },
        { provide: AppMenuService, useValue: appMenu },
        { provide: WishlistService, useValue: { entries, loaded: signal(true) } },
        { provide: InboxService, useValue: { unread } },
      ],
    });
    component = TestBed.createComponent(AppMenuComponent).componentInstance;
  });

  describe('share-hunt-list count', () => {
    it('counts only bottles still being hunted', () => {
      entries.set([
        entry({ id: 'a', status: 'actively_looking' }),
        entry({ id: 'b', status: 'got_away' }),
        entry({ id: 'c', status: 'actively_looking' }),
      ]);
      expect(component.activeCount()).toBe(2);
    });

    it('is zero on an empty list, so the template hides the item', () => {
      expect(component.activeCount()).toBe(0);
    });
  });

  it('surfaces the unread count for the Notifications badge', () => {
    unread.set(5);
    expect(component.unread()).toBe(5);
  });

  describe('navigation', () => {
    it('closes the drawer before navigating', async () => {
      const order: string[] = [];
      appMenu.close.mockImplementation(async () => void order.push('close'));
      router.navigate.mockImplementation(async () => void order.push('navigate'));

      await component.go(['/settings']);
      expect(order).toEqual(['close', 'navigate']);
    });

    it('routes plain destinations with no query params', async () => {
      await component.go(['/stores']);
      expect(router.navigate).toHaveBeenCalledWith(['/stores'], {});
    });

    it('reaches the Hunt modals by flag, keeping them in the lazy chunk', async () => {
      await component.go(['/tabs/hunt-list'], { lookup: 1 });
      expect(router.navigate).toHaveBeenCalledWith(['/tabs/hunt-list'], {
        queryParams: { lookup: 1 },
      });

      await component.go(['/tabs/hunt-list'], { share: 1 });
      expect(router.navigate).toHaveBeenCalledWith(['/tabs/hunt-list'], {
        queryParams: { share: 1 },
      });
    });
  });

  it('reports its open state back to the service', () => {
    component.onOpen();
    expect(appMenu.setOpen).toHaveBeenCalledWith(true);
    component.onClose();
    expect(appMenu.setOpen).toHaveBeenCalledWith(false);
  });
});
