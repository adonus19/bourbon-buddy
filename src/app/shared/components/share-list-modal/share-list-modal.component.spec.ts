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
import { ShareListModalComponent } from './share-list-modal.component';

describe('ShareListModalComponent (BB-230d)', () => {
  let component: ShareListModalComponent;
  let sharing: { shareList: jest.Mock };
  let friendService: { friendsOnce: jest.Mock };
  let modal: { dismiss: jest.Mock };

  const friend = { uid: 'bob', displayName: 'Bob', username: 'bob', avatarUrl: null };

  beforeEach(() => {
    sharing = { shareList: jest.fn().mockResolvedValue({ shareId: 's2', bottleCount: 5 }) };
    friendService = { friendsOnce: jest.fn().mockResolvedValue([friend]) };
    modal = { dismiss: jest.fn().mockResolvedValue(true) };

    TestBed.configureTestingModule({
      declarations: [ShareListModalComponent],
      providers: [
        { provide: SharingService, useValue: sharing },
        { provide: FriendService, useValue: friendService },
        { provide: ModalController, useValue: modal },
        { provide: ToastController, useValue: { create: () => Promise.resolve({ present: jest.fn() }) } },
        { provide: Router, useValue: { navigate: jest.fn() } },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });
    component = TestBed.createComponent(ShareListModalComponent).componentInstance;
  });

  it('does nothing when no friend is selected', async () => {
    await component.ngOnInit();
    await component.share();
    expect(sharing.shareList).not.toHaveBeenCalled();
  });

  it('shares the list with the selected friend and dismisses', async () => {
    await component.ngOnInit();
    component.selectedUid.set('bob');
    component.note.setValue('here you go');
    await component.share();
    expect(sharing.shareList).toHaveBeenCalledWith({ toUid: 'bob', note: 'here you go' });
    expect(modal.dismiss).toHaveBeenCalledWith(null, 'shared');
  });
});
