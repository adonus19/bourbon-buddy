import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';

jest.mock('@ionic/angular', () => ({ ToastController: class {} }));

import { ToastController } from '@ionic/angular';

import { SharedItemsService } from '../../../core/services/shared-items.service';
import { WishlistService } from '../../../core/services/wishlist.service';
import { SharedItemReceivePage } from './shared-item-receive.page';

describe('SharedItemReceivePage (BB-230c)', () => {
  let page: SharedItemReceivePage;
  let sharedItems: { get: jest.Mock; markStatus: jest.Mock };
  let wishlist: { add: jest.Mock; entries: jest.Mock };
  let router: { navigate: jest.Mock; navigateByUrl: jest.Mock };

  const item = {
    id: 's1',
    kind: 'bottle',
    bourbonId: 'b1',
    bottleName: 'Weller 12',
    distillery: 'BT',
    category: 'bourbon',
    fromUsername: 'alice',
    status: 'pending',
  };

  beforeEach(() => {
    sharedItems = {
      get: jest.fn().mockResolvedValue(item),
      markStatus: jest.fn().mockResolvedValue(undefined),
    };
    wishlist = { add: jest.fn().mockResolvedValue('w1'), entries: jest.fn().mockReturnValue([]) };
    router = { navigate: jest.fn().mockResolvedValue(true), navigateByUrl: jest.fn().mockResolvedValue(true) };

    TestBed.configureTestingModule({
      declarations: [SharedItemReceivePage],
      providers: [
        { provide: SharedItemsService, useValue: sharedItems },
        { provide: WishlistService, useValue: wishlist },
        { provide: Router, useValue: router },
        { provide: ToastController, useValue: { create: () => Promise.resolve({ present: jest.fn() }) } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 's1' } } } },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });
    page = TestBed.createComponent(SharedItemReceivePage).componentInstance;
  });

  it('loads the shared item on init', async () => {
    await page.ngOnInit();
    expect(sharedItems.get).toHaveBeenCalledWith('s1');
    expect(page.item()?.bottleName).toBe('Weller 12');
  });

  it('cellar intent: marks imported and opens the log form preset by intent', async () => {
    await page.ngOnInit();
    await page.receiveToCellar('graveyard');
    expect(sharedItems.markStatus).toHaveBeenCalledWith('s1', 'imported');
    expect(router.navigate).toHaveBeenCalledWith(['/entry/new'], {
      queryParams: { fromShared: 's1', intent: 'graveyard' },
    });
  });

  it('hunt-list intent: adds a wishlist entry with the status and marks imported', async () => {
    await page.ngOnInit();
    await page.receiveToHuntList('got_away');
    expect(wishlist.add).toHaveBeenCalledWith(
      expect.objectContaining({ bourbonId: 'b1', bourbonName: 'Weller 12', status: 'got_away', discoverySource: 'Shared' })
    );
    expect(sharedItems.markStatus).toHaveBeenCalledWith('s1', 'imported');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/tabs/hunt-list');
  });

  it('dismiss marks the share dismissed', async () => {
    await page.ngOnInit();
    await page.dismiss();
    expect(sharedItems.markStatus).toHaveBeenCalledWith('s1', 'dismissed');
  });

  it('list share: imports all bottles (skipping dupes) and marks imported', async () => {
    sharedItems.get.mockResolvedValue({
      id: 's1',
      kind: 'list',
      status: 'pending',
      bottleCount: 2,
      bottles: [
        { bourbonId: 'b1', bottleName: 'Weller 12', distillery: 'BT', category: 'bourbon' },
        { bourbonId: 'b2', bottleName: 'Blanton\'s', distillery: 'BT', category: 'bourbon' },
      ],
    });
    // b1 already on the hunt list → only b2 gets added.
    wishlist.entries.mockReturnValue([{ bourbonId: 'b1' }]);

    await page.ngOnInit();
    await page.receiveListToHuntList();

    expect(wishlist.add).toHaveBeenCalledTimes(1);
    expect(wishlist.add).toHaveBeenCalledWith(
      expect.objectContaining({ bourbonId: 'b2', status: 'actively_looking', discoverySource: 'Shared' })
    );
    expect(sharedItems.markStatus).toHaveBeenCalledWith('s1', 'imported');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/tabs/hunt-list');
  });
});
