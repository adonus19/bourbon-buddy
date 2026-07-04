import { TestBed } from '@angular/core/testing';

jest.mock('@angular/fire/firestore', () => ({
  Firestore: class {},
  collection: jest.fn(() => 'col'),
  collectionData: jest.fn(),
  deleteDoc: jest.fn(() => Promise.resolve()),
  doc: jest.fn((_fs, path) => ({ path })),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  query: jest.fn((...a) => a),
  where: jest.fn(() => 'where'),
}));
jest.mock('@angular/fire/functions', () => ({
  Functions: class {},
  httpsCallable: jest.fn(),
}));

import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { AuthService } from '../auth/auth.service';
import { FriendService } from './friend.service';

const asMock = (fn: unknown) => fn as jest.Mock;

/** Firestore DocumentSnapshot stub. */
const snap = (exists: boolean, data: Record<string, unknown> = {}, id = 'x') => ({
  exists: () => exists,
  id,
  get: (k: string) => data[k],
  data: () => data,
});

describe('FriendService', () => {
  let service: FriendService;

  function setup(uid: string | null) {
    TestBed.configureTestingModule({
      providers: [
        FriendService,
        { provide: Firestore, useValue: {} },
        { provide: Functions, useValue: {} },
        { provide: AuthService, useValue: { snapshotUser: uid ? { uid } : null } },
      ],
    });
    service = TestBed.inject(FriendService);
  }

  afterEach(() => jest.clearAllMocks());

  describe('searchByUsername', () => {
    /** Route each getDoc by the doc path it was called with. */
    function routeGetDoc(map: {
      reservation?: ReturnType<typeof snap>;
      publicProfile?: ReturnType<typeof snap>;
      block?: ReturnType<typeof snap>;
    }) {
      asMock(getDoc).mockImplementation((ref: { path: string }) => {
        if (ref.path.startsWith('usernames/')) return Promise.resolve(map.reservation);
        if (ref.path.startsWith('publicProfiles/')) return Promise.resolve(map.publicProfile);
        return Promise.resolve(map.block);
      });
    }

    it('returns null for an invalid handle without hitting Firestore', async () => {
      setup('me');
      expect(await service.searchByUsername('ab')).toBeNull(); // too short
      expect(getDoc).not.toHaveBeenCalled();
    });

    it('returns null when signed out', async () => {
      setup(null);
      expect(await service.searchByUsername('validname')).toBeNull();
    });

    it('returns null when the handle is unclaimed', async () => {
      setup('me');
      routeGetDoc({ reservation: snap(false) });
      expect(await service.searchByUsername('ghost')).toBeNull();
    });

    it('returns null when the handle resolves to yourself', async () => {
      setup('me');
      routeGetDoc({ reservation: snap(true, { uid: 'me' }) });
      expect(await service.searchByUsername('myself')).toBeNull();
    });

    it('returns null when the profile is not discoverable', async () => {
      setup('me');
      routeGetDoc({
        reservation: snap(true, { uid: 'other' }),
        publicProfile: snap(true, { isDiscoverable: false }, 'other'),
      });
      expect(await service.searchByUsername('hidden')).toBeNull();
    });

    it('returns null when you have blocked the user', async () => {
      setup('me');
      routeGetDoc({
        reservation: snap(true, { uid: 'other' }),
        publicProfile: snap(true, { isDiscoverable: true }, 'other'),
        block: snap(true),
      });
      expect(await service.searchByUsername('blocked')).toBeNull();
    });

    it('returns the profile on a clean match', async () => {
      setup('me');
      routeGetDoc({
        reservation: snap(true, { uid: 'other' }),
        publicProfile: snap(
          true,
          { isDiscoverable: true, displayName: 'Sam' },
          'other'
        ),
        block: snap(false),
      });
      const result = await service.searchByUsername('sam');
      expect(result).toMatchObject({ id: 'other', displayName: 'Sam' });
    });
  });

  describe('callable + owner-write wrappers', () => {
    it('sendFriendRequest invokes the callable with the target', async () => {
      setup('me');
      const callable = jest.fn().mockResolvedValue({ data: { id: 'r1' } });
      asMock(httpsCallable).mockReturnValue(callable);
      await service.sendFriendRequest('friend-uid');
      expect(httpsCallable).toHaveBeenCalledWith(
        expect.anything(),
        'sendFriendRequest'
      );
      expect(callable).toHaveBeenCalledWith({ toUid: 'friend-uid' });
    });

    it('unblockUser deletes the block doc for the current user', async () => {
      setup('me');
      const { deleteDoc } = jest.requireMock('@angular/fire/firestore');
      await service.unblockUser('blocked-uid');
      expect(doc).toHaveBeenCalledWith(
        expect.anything(),
        'users/me/blocks/blocked-uid'
      );
      expect(deleteDoc).toHaveBeenCalled();
    });
  });
});
