import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

jest.mock('@angular/fire/firestore', () => ({
  Firestore: class {},
  doc: jest.fn((_fs, path) => ({ path })),
  getDoc: jest.fn(),
  updateDoc: jest.fn(() => Promise.resolve()),
  collection: jest.fn((_fs, path) => ({ path })),
  collectionData: jest.fn(),
  query: jest.fn((ref, ...constraints) => ({ ref, constraints })),
  where: jest.fn((field, op, value) => ({ type: 'where', field, op, value })),
  orderBy: jest.fn((field, dir) => ({ type: 'orderBy', field, dir })),
}));

import {
  Firestore,
  collection,
  collectionData,
  doc,
  getDoc,
  orderBy,
  query,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { AuthService } from '../auth/auth.service';
import { SharedItemsService } from './shared-items.service';

const asMock = (fn: unknown) => fn as jest.Mock;
const snap = (exists: boolean, data: Record<string, unknown> = {}, id = 's1') => ({
  exists: () => exists,
  id,
  data: () => data,
});

describe('SharedItemsService', () => {
  let service: SharedItemsService;

  function setup(uid: string | null) {
    TestBed.configureTestingModule({
      providers: [
        SharedItemsService,
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
    service = TestBed.inject(SharedItemsService);
  }

  beforeEach(() => asMock(collectionData).mockReturnValue(of([])));
  afterEach(() => jest.clearAllMocks());

  it('reads a shared item under the current user and hydrates its id', async () => {
    setup('me');
    asMock(getDoc).mockResolvedValue(snap(true, { kind: 'bottle', bottleName: 'Weller 12' }));
    const item = await service.get('s1');
    expect(asMock(doc).mock.calls[0][1]).toBe('users/me/sharedItems/s1');
    expect(item).toMatchObject({ id: 's1', bottleName: 'Weller 12' });
  });

  it('returns null when the share does not exist', async () => {
    setup('me');
    asMock(getDoc).mockResolvedValue(snap(false));
    expect(await service.get('missing')).toBeNull();
  });

  it('returns null (no read) when signed out', async () => {
    setup(null);
    expect(await service.get('s1')).toBeNull();
    expect(asMock(getDoc)).not.toHaveBeenCalled();
  });

  it('marks a share imported', async () => {
    setup('me');
    await service.markStatus('s1', 'imported');
    expect(asMock(doc).mock.calls[0][1]).toBe('users/me/sharedItems/s1');
    expect(asMock(updateDoc)).toHaveBeenCalledWith(expect.anything(), { status: 'imported' });
  });

  it('exposes received PENDING shares newest-first from the listener (BB-230e)', () => {
    const rows = [
      { id: 'a', kind: 'bottle', fromUid: 'u1' },
      { id: 'b', kind: 'list', fromUid: 'u2' },
    ];
    asMock(collectionData).mockReturnValue(of(rows));
    setup('me');
    expect(service.received()).toEqual(rows);
    expect(service.receivedLoaded()).toBe(true);
    // Scopes to the recipient's own subcollection, pending-only, newest-first.
    expect(asMock(collection).mock.calls[0][1]).toBe('users/me/sharedItems');
    expect(asMock(where)).toHaveBeenCalledWith('status', '==', 'pending');
    expect(asMock(orderBy)).toHaveBeenCalledWith('createdAt', 'desc');
    expect(asMock(collectionData)).toHaveBeenCalledWith(expect.anything(), { idField: 'id' });
    expect(asMock(query)).toHaveBeenCalled();
  });

  it('received is empty (no query) when signed out', () => {
    setup(null);
    expect(service.received()).toEqual([]);
    expect(asMock(collectionData)).not.toHaveBeenCalled();
  });
});
