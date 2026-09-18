import { TestBed } from '@angular/core/testing';

jest.mock('@ionic/angular', () => ({ MenuController: class {} }));

import { MenuController } from '@ionic/angular';

import { APP_MENU_ID, AppMenuService } from './app-menu.service';
import { InboxService } from './inbox.service';

describe('AppMenuService (BB-247)', () => {
  let service: AppMenuService;
  let menu: { open: jest.Mock; close: jest.Mock };
  let inbox: { unreadCount: jest.Mock };

  beforeEach(() => {
    menu = {
      open: jest.fn().mockResolvedValue(true),
      close: jest.fn().mockResolvedValue(true),
    };
    inbox = { unreadCount: jest.fn().mockResolvedValue(0) };

    TestBed.configureTestingModule({
      providers: [
        AppMenuService,
        { provide: MenuController, useValue: menu },
        { provide: InboxService, useValue: inbox },
      ],
    });
    service = TestBed.inject(AppMenuService);
  });

  it('starts closed', () => {
    expect(service.isOpen()).toBe(false);
  });

  it('opens the one app-wide drawer by id', async () => {
    await service.open();
    expect(menu.open).toHaveBeenCalledWith(APP_MENU_ID);
  });

  it('resyncs the unread badge on open — the moment the user looks at it', async () => {
    await service.open();
    expect(inbox.unreadCount).toHaveBeenCalledTimes(1);
  });

  it('closes by id', async () => {
    await service.close();
    expect(menu.close).toHaveBeenCalledWith(APP_MENU_ID);
  });

  it('mirrors the drawer state reported by ionDidOpen / ionDidClose', () => {
    service.setOpen(true);
    expect(service.isOpen()).toBe(true);
    service.setOpen(false);
    expect(service.isOpen()).toBe(false);
  });
});
