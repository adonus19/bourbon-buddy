import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

jest.mock('@angular/fire/firestore', () => ({
  Firestore: class {},
  collection: jest.fn((_fs: unknown, path: string) => path),
  collectionData: jest.fn(),
  deleteDoc: jest.fn(() => Promise.resolve()),
  doc: jest.fn(),
  getDocs: jest.fn(),
  limit: jest.fn(() => 'limit'),
  orderBy: jest.fn(() => 'orderBy'),
  query: jest.fn((...a: unknown[]) => a),
  serverTimestamp: jest.fn(() => 'ts'),
  startAfter: jest.fn(() => 'startAfter'),
  Timestamp: class {},
  updateDoc: jest.fn(() => Promise.resolve()),
  where: jest.fn(() => 'where'),
}));
jest.mock('@angular/fire/functions', () => ({
  Functions: class {},
  httpsCallable: jest.fn(),
}));

import { Firestore, getDocs, updateDoc } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { AuthService } from '../auth/auth.service';
import { SightingService, SightingInput } from './sighting.service';

const asMock = (fn: unknown) => fn as jest.Mock;

describe('SightingService.add — best-price recompute (BB-161 race fix)', () => {
  let service: SightingService;
  let callableFn: jest.Mock;

  const nowTimestamp = { toMillis: () => Date.now() } as never;
  const input: SightingInput = {
    storeName: 'Total Wine',
    price: 42,
    sightingDate: nowTimestamp,
    city: null,
    state: null,
    notes: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    callableFn = jest.fn().mockResolvedValue({ data: { id: 's1' } });
    asMock(httpsCallable).mockReturnValue(callableFn);
    TestBed.configureTestingModule({
      providers: [
        SightingService,
        { provide: Firestore, useValue: {} },
        { provide: Functions, useValue: {} },
        {
          provide: AuthService,
          useValue: { snapshotUser: { uid: 'u1' }, currentUser$: of(null) },
        },
      ],
    });
    service = TestBed.inject(SightingService);
  });

  it('writes the new price even when the sightings query has not caught up', async () => {
    asMock(getDocs)
      // 1st query: the user's sightings — empty (function write not yet indexed)
      .mockResolvedValueOnce({ docs: [] })
      // 2nd query: the user's wishlist entries for this bottle
      .mockResolvedValueOnce({ docs: [{ ref: 'entryRef' }] });

    await service.add('b1', 'Buffalo Trace', input, 'private');

    expect(callableFn).toHaveBeenCalledTimes(1);
    expect(updateDoc).toHaveBeenCalledWith('entryRef', {
      bestSightingPrice: 42,
      updatedAt: 'ts',
    });
  });

  it('does not double-count once the query does include the new sighting', async () => {
    asMock(getDocs)
      .mockResolvedValueOnce({
        docs: [
          {
            id: 's1',
            data: () => ({
              price: 42,
              sightingDate: nowTimestamp,
              markedStaleManually: false,
            }),
          },
        ],
      })
      .mockResolvedValueOnce({ docs: [{ ref: 'entryRef' }] });

    await service.add('b1', 'Buffalo Trace', input, 'private');

    expect(updateDoc).toHaveBeenCalledWith('entryRef', {
      bestSightingPrice: 42,
      updatedAt: 'ts',
    });
  });
});
