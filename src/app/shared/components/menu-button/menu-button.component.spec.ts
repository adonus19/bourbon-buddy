import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

jest.mock('@ionic/angular', () => ({ MenuController: class {} }));

import { AppMenuService } from '../../../core/services/app-menu.service';
import { InboxService } from '../../../core/services/inbox.service';
import { MenuButtonComponent } from './menu-button.component';

describe('MenuButtonComponent (BB-247)', () => {
  let component: MenuButtonComponent;
  let appMenu: { open: jest.Mock; isOpen: () => boolean };
  const unread = signal(0);
  const isOpen = signal(false);

  beforeEach(() => {
    unread.set(0);
    isOpen.set(false);
    appMenu = { open: jest.fn().mockResolvedValue(undefined), isOpen };

    TestBed.configureTestingModule({
      declarations: [MenuButtonComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: AppMenuService, useValue: appMenu },
        { provide: InboxService, useValue: { unread } },
      ],
    });
    component = TestBed.createComponent(MenuButtonComponent).componentInstance;
  });

  it('carries the unread count that used to sit on the Cellar bell', () => {
    expect(component.unread()).toBe(0);
    unread.set(3);
    expect(component.unread()).toBe(3);
  });

  it('opens the drawer', () => {
    component.open();
    expect(appMenu.open).toHaveBeenCalledTimes(1);
  });

  it('mirrors drawer state for aria-expanded', () => {
    expect(component.expanded()).toBe(false);
    isOpen.set(true);
    expect(component.expanded()).toBe(true);
  });
});
