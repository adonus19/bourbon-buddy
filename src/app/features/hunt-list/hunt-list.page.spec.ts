import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

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
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: new BehaviorSubject(convertToParamMap({})) },
        },
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

describe('HuntListPage — app menu hand-off (BB-247)', () => {
  let page: HuntListPage;
  let router: { navigate: jest.Mock };
  let queryParamMap: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  function setup(): void {
    queryParamMap = new BehaviorSubject(convertToParamMap({}));
    router = { navigate: jest.fn().mockResolvedValue(true) };

    TestBed.configureTestingModule({
      declarations: [HuntListPage],
      providers: [
        {
          provide: WishlistService,
          useValue: { entries: signal([]), loaded: signal(true) },
        },
        {
          provide: SharedItemsService,
          useValue: {
            received: signal([]),
            receivedLoaded: () => true,
            markStatus: jest.fn(),
          },
        },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { queryParamMap } },
        { provide: ActionSheetController, useValue: {} },
        { provide: AlertController, useValue: {} },
        { provide: ModalController, useValue: {} },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });
    page = TestBed.createComponent(HuntListPage).componentInstance;
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    setup();
  });

  it('ignores a plain visit with no flag', () => {
    page.ngOnInit();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('opens the lookup modal when the drawer routes here with ?lookup=1', async () => {
    const openLookup = jest.spyOn(page, 'openLookup').mockResolvedValue();
    page.ngOnInit();
    queryParamMap.next(convertToParamMap({ lookup: '1' }));
    await Promise.resolve();
    expect(openLookup).toHaveBeenCalledTimes(1);
  });

  it('opens the share sheet when the drawer routes here with ?share=1', async () => {
    const shareList = jest.spyOn(page, 'shareList').mockResolvedValue();
    page.ngOnInit();
    queryParamMap.next(convertToParamMap({ share: '1' }));
    await Promise.resolve();
    expect(shareList).toHaveBeenCalledTimes(1);
  });

  it('clears the flag so Back cannot re-open the modal', async () => {
    jest.spyOn(page, 'openLookup').mockResolvedValue();
    page.ngOnInit();
    queryParamMap.next(convertToParamMap({ lookup: '1' }));
    await Promise.resolve();

    expect(router.navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: {}, replaceUrl: true })
    );
  });

  it('opens the modal only after the flag is cleared', async () => {
    const order: string[] = [];
    router.navigate.mockImplementation(async () => {
      order.push('clear');
      return true;
    });
    jest.spyOn(page, 'openLookup').mockImplementation(async () => {
      order.push('open');
    });

    page.ngOnInit();
    queryParamMap.next(convertToParamMap({ lookup: '1' }));
    await Promise.resolve();
    await Promise.resolve();

    expect(order).toEqual(['clear', 'open']);
  });
});
