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

import { Firestore, doc, getDoc, getDocs } from '@angular/fire/firestore';
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

  // BB-228c: friendsOnce sits on the critical path of every price-history load
  // and costs a collection read PLUS one publicProfiles getDoc per friend.
  describe('friendsOnce memoization (BB-228c)', () => {
    const edges = (ids: string[]) => ({
      empty: ids.length === 0,
      docs: ids.map((id) => ({ id })),
    });

    beforeEach(() => {
      setup('u1');
      asMock(getDocs).mockResolvedValue(edges(['f1']));
      asMock(getDoc).mockResolvedValue(
        snap(true, { displayName: 'Friend One' }, 'f1')
      );
    });

    it('reads the edges once across repeated calls', async () => {
      await service.friendsOnce();
      await service.friendsOnce();
      expect(asMock(getDocs)).toHaveBeenCalledTimes(1);
    });

    it('shares one request between concurrent callers', async () => {
      const [a, b] = await Promise.all([
        service.friendsOnce(),
        service.friendsOnce(),
      ]);
      expect(asMock(getDocs)).toHaveBeenCalledTimes(1);
      expect(b).toEqual(a);
    });

    it('refetches after the graph changes', async () => {
      await service.friendsOnce();
      asMock(httpsCallable).mockReturnValue(jest.fn().mockResolvedValue({}));
      await service.removeFriend('f1');
      await service.friendsOnce();
      expect(asMock(getDocs)).toHaveBeenCalledTimes(2);
    });

    it('does not memoize a failed read', async () => {
      asMock(getDocs).mockRejectedValueOnce(new Error('offline'));
      await expect(service.friendsOnce()).rejects.toThrow('offline');
      await service.friendsOnce();
      expect(asMock(getDocs)).toHaveBeenCalledTimes(2);
    });
  });

  // BB-228c: the preview sheet's crowd-price line only needs UIDs to build the
  // `where('spotterUid','in',...)` query — hydrating each friend's public
  // profile there is N document reads thrown away.
  describe('friendUidsOnce (BB-228c)', () => {
    beforeEach(() => {
      setup('u1');
      asMock(getDocs).mockResolvedValue({
        empty: false,
        docs: [{ id: 'f1' }, { id: 'f2' }],
      });
    });

    it('returns the edge ids without reading any public profile', async () => {
      // The edge doc ID *is* the friend's uid, so hydration buys nothing here.
      expect(await service.friendUidsOnce()).toEqual(['f1', 'f2']);
      expect(asMock(getDoc)).not.toHaveBeenCalled();
    });

    it('reads once across repeated calls', async () => {
      await service.friendUidsOnce();
      await service.friendUidsOnce();
      expect(asMock(getDocs)).toHaveBeenCalledTimes(1);
    });

    it('reuses an already-loaded full friends list instead of re-reading', async () => {
      asMock(getDoc).mockResolvedValue(
        snap(true, { displayName: 'Friend One' }, 'f1')
      );
      await service.friendsOnce(); // full hydrate, 1 getDocs
      asMock(getDocs).mockClear();

      expect(await service.friendUidsOnce()).toEqual(['f1', 'f2']);
      expect(asMock(getDocs)).not.toHaveBeenCalled();
    });

    it('refetches after the graph changes', async () => {
      await service.friendUidsOnce();
      asMock(httpsCallable).mockReturnValue(jest.fn().mockResolvedValue({}));
      await service.removeFriend('f1');
      await service.friendUidsOnce();
      expect(asMock(getDocs)).toHaveBeenCalledTimes(2);
    });

    it('returns empty when signed out', async () => {
      TestBed.resetTestingModule(); // beforeEach already built a signed-in one
      setup(null);
      expect(await service.friendUidsOnce()).toEqual([]);
      expect(asMock(getDocs)).not.toHaveBeenCalled();
    });
  });

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
