import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

jest.mock('@ionic/angular', () => ({
  ToastController: class {},
  ModalController: class {},
}));

import { ModalController, ToastController } from '@ionic/angular';

import { FriendService } from '../../../core/services/friend.service';
import { SharingService } from '../../../core/services/sharing.service';
import { ShareBottleModalComponent } from './share-bottle-modal.component';

describe('ShareBottleModalComponent (BB-230b)', () => {
  let component: ShareBottleModalComponent;
  let sharing: { shareBottle: jest.Mock };
  let friendService: { friendsOnce: jest.Mock };
  let modal: { dismiss: jest.Mock };

  const friend = { uid: 'bob', displayName: 'Bob', username: 'bob', avatarUrl: null };

  beforeEach(() => {
    sharing = { shareBottle: jest.fn().mockResolvedValue({ shareId: 's1', bourbonId: 'b1' }) };
    friendService = { friendsOnce: jest.fn().mockResolvedValue([friend]) };
    modal = { dismiss: jest.fn().mockResolvedValue(true) };

    TestBed.configureTestingModule({
      declarations: [ShareBottleModalComponent],
      providers: [
        { provide: SharingService, useValue: sharing },
        { provide: FriendService, useValue: friendService },
        { provide: ModalController, useValue: modal },
        { provide: ToastController, useValue: { create: () => Promise.resolve({ present: jest.fn() }) } },
        { provide: Router, useValue: { navigate: jest.fn() } },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });
    component = TestBed.createComponent(ShareBottleModalComponent).componentInstance;
    component.bottle = { name: 'Weller 12', bourbonId: 'b1', distillery: 'BT', category: 'bourbon' };
  });

  it('loads friends on init', async () => {
    await component.ngOnInit();
    expect(component.friends()).toEqual([friend]);
    expect(component.loading()).toBe(false);
  });

  it('does nothing when no friend is selected', async () => {
    await component.ngOnInit();
    await component.share();
    expect(sharing.shareBottle).not.toHaveBeenCalled();
  });

  it('shares with the selected friend, omitting the rating unless opted in', async () => {
    await component.ngOnInit();
    component.myRating = 4.5;
    component.selectedUid.set('bob');
    await component.share();

    expect(sharing.shareBottle).toHaveBeenCalledWith(
      expect.objectContaining({ toUid: 'bob', bourbonId: 'b1', sharerRating: null })
    );
    expect(modal.dismiss).toHaveBeenCalledWith(null, 'shared');
  });

  it('includes the rating only when the opt-in toggle is on', async () => {
    await component.ngOnInit();
    component.myRating = 4.5;
    component.selectedUid.set('bob');
    component.includeRating.set(true);
    await component.share();

    expect(sharing.shareBottle).toHaveBeenCalledWith(
      expect.objectContaining({ sharerRating: 4.5 })
    );
  });
});
