import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

jest.mock('@ionic/angular', () => ({
  ActionSheetController: class {},
  AlertController: class {},
  ModalController: class {},
}));

import {
  ActionSheetController,
  AlertController,
  ModalController,
} from '@ionic/angular';

import { SharedItem } from '../../models';
import { SharedItemsService } from '../../core/services/shared-items.service';
import { WishlistService } from '../../core/services/wishlist.service';
import { HuntListPage } from './hunt-list.page';

const share = (over: Partial<SharedItem>): SharedItem =>
  ({ id: 'x', kind: 'bottle', fromUid: 'u1', fromDisplayName: 'Alice', status: 'pending', ...over } as SharedItem);

describe('HuntListPage — Shared with me (BB-230e)', () => {
  let page: HuntListPage;
  const received = signal<SharedItem[]>([]);
  let sharedItems: { received: typeof received; receivedLoaded: () => boolean; markStatus: jest.Mock };
  let router: { navigate: jest.Mock };

  beforeEach(() => {
    received.set([]);
    sharedItems = {
      received,
      receivedLoaded: () => true,
      markStatus: jest.fn().mockResolvedValue(undefined),
    };
    router = { navigate: jest.fn().mockResolvedValue(true) };

    TestBed.configureTestingModule({
      declarations: [HuntListPage],
      providers: [
        {
          provide: WishlistService,
          useValue: { entries: signal([]), loaded: signal(true) },
        },
        { provide: SharedItemsService, useValue: sharedItems },
        { provide: Router, useValue: router },
        { provide: ActionSheetController, useValue: {} },
        { provide: AlertController, useValue: {} },
        { provide: ModalController, useValue: {} },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });
    page = TestBed.createComponent(HuntListPage).componentInstance;
  });

  it('groups received shares by sharer and counts them', () => {
    received.set([
      share({ id: 'a', fromUid: 'u1' }),
      share({ id: 'b', fromUid: 'u2', fromDisplayName: 'Bob' }),
      share({ id: 'c', fromUid: 'u1' }),
    ]);
    expect(page.sharedCount()).toBe(3);
    expect(page.sharedGroups().map((g) => g.fromUid)).toEqual(['u1', 'u2']);
  });

  it('expands only the top group by default', () => {
    received.set([
      share({ id: 'a', fromUid: 'top' }),
      share({ id: 'b', fromUid: 'other' }),
    ]);
    expect(page.isGroupExpanded('top')).toBe(true);
    expect(page.isGroupExpanded('other')).toBe(false);
  });

  it('toggleGroup expands and collapses a group', () => {
    received.set([share({ id: 'a', fromUid: 'top' }), share({ id: 'b', fromUid: 'other' })]);
    page.toggleGroup('other');
    expect(page.isGroupExpanded('other')).toBe(true);
    page.toggleGroup('other');
    expect(page.isGroupExpanded('other')).toBe(false);
  });

  it('opening a share navigates to the receive chooser', async () => {
    await page.openShare(share({ id: 's9' }));
    expect(router.navigate).toHaveBeenCalledWith(['/shared', 's9']);
  });

  it('dismissing a share marks it dismissed (keep-separate = leave it)', async () => {
    await page.dismissShare(share({ id: 's9' }));
    expect(sharedItems.markStatus).toHaveBeenCalledWith('s9', 'dismissed');
  });

  it('setView switches the segment and archived derives from it', () => {
    page.setView('archived');
    expect(page.view()).toBe('archived');
    expect(page.archived()).toBe(true);
    page.setView('shared');
    expect(page.archived()).toBe(false);
  });
});
