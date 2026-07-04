import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

jest.mock('@angular/fire/firestore', () => ({
  Firestore: class {},
  collection: jest.fn(() => 'col'),
  collectionData: jest.fn(),
  doc: jest.fn((_fs, path) => ({ path })),
  getCountFromServer: jest.fn(),
  limit: jest.fn(() => 'limit'),
  orderBy: jest.fn(() => 'orderBy'),
  query: jest.fn((...a) => a),
  updateDoc: jest.fn(() => Promise.resolve()),
  where: jest.fn(() => 'where'),
  writeBatch: jest.fn(),
}));

import {
  Firestore,
  collectionData,
  getCountFromServer,
  updateDoc,
  writeBatch,
} from '@angular/fire/firestore';
import { AppNotification } from '../../models';
import { AuthService } from '../auth/auth.service';
import { InboxService } from './inbox.service';

const asMock = (fn: unknown) => fn as jest.Mock;

describe('InboxService', () => {
  let service: InboxService;

  function setup(uid: string | null) {
    TestBed.configureTestingModule({
      providers: [
        InboxService,
        { provide: Firestore, useValue: {} },
        {
          provide: AuthService,
          useValue: {
            snapshotUser: uid ? { uid } : null,
            currentUser$: of(uid ? { uid } : null),
          },
        },
      ],
    });
    service = TestBed.inject(InboxService);
  }

  afterEach(() => jest.clearAllMocks());

  describe('unreadCount', () => {
    it('returns the server aggregation count', async () => {
      setup('u1');
      asMock(getCountFromServer).mockResolvedValue({ data: () => ({ count: 4 }) });
      expect(await service.unreadCount()).toBe(4);
    });

    it('returns 0 when signed out', async () => {
      setup(null);
      expect(await service.unreadCount()).toBe(0);
      expect(getCountFromServer).not.toHaveBeenCalled();
    });
  });

  describe('inbox$', () => {
    it('streams the collection for a signed-in user', (done) => {
      setup('u1');
      const items = [{ id: 'n1', read: false }] as AppNotification[];
      asMock(collectionData).mockReturnValue(of(items));
      service.inbox$().subscribe((res) => {
        expect(res).toEqual(items);
        done();
      });
    });
  });

  describe('markRead', () => {
    it('sets read=true on the notification doc', async () => {
      setup('u1');
      await service.markRead('n1');
      expect(updateDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'users/u1/notifications/n1' }),
        { read: true }
      );
    });

    it('no-ops when signed out', async () => {
      setup(null);
      await service.markRead('n1');
      expect(updateDoc).not.toHaveBeenCalled();
    });
  });

  describe('markAllRead', () => {
    it('batches updates for unread items only', async () => {
      setup('u1');
      const batch = { update: jest.fn(), commit: jest.fn(() => Promise.resolve()) };
      asMock(writeBatch).mockReturnValue(batch);
      await service.markAllRead([
        { id: 'a', read: false },
        { id: 'b', read: true }, // already read -> skipped
        { id: 'c', read: false },
      ] as AppNotification[]);
      expect(batch.update).toHaveBeenCalledTimes(2);
      expect(batch.commit).toHaveBeenCalled();
    });

    it('does nothing when there is nothing unread', async () => {
      setup('u1');
      await service.markAllRead([{ id: 'a', read: true }] as AppNotification[]);
      expect(writeBatch).not.toHaveBeenCalled();
    });
  });
});
