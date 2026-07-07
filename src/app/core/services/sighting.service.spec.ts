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
  Timestamp: { fromMillis: jest.fn((ms: number) => ({ toMillis: () => ms })) },
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
import { SightingOutboxService } from './sighting-outbox.service';

function setOnline(online: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: online });
}

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

  let outbox: SightingOutboxService;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    setOnline(true);
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
    outbox = TestBed.inject(SightingOutboxService);
    service = TestBed.inject(SightingService);
  });

  it('writes the new price even when the sightings query has not caught up', async () => {
    asMock(getDocs)
      // 1st query: the user's sightings — empty (function write not yet indexed)
      .mockResolvedValueOnce({ docs: [] })
      // 2nd query: the user's wishlist entries for this bottle
      .mockResolvedValueOnce({ docs: [{ ref: 'entryRef' }] });

    const result = await service.add('b1', 'Buffalo Trace', input, 'private');

    expect(result).toBe('sent');
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

  it('queues the sighting and resolves "queued" when offline (BB-182)', async () => {
    setOnline(false);
    callableFn.mockRejectedValue({ code: 'functions/unavailable' });

    await expect(
      service.add('b1', 'Buffalo Trace', input, 'private')
    ).resolves.toBe('queued');

    expect(outbox.pending()).toBe(1);
    expect(outbox.items()[0].bourbonId).toBe('b1');
    // Recompute never ran — the write didn't happen.
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('surfaces a permanent (validation) error and does not queue (BB-182)', async () => {
    callableFn.mockRejectedValue({ code: 'functions/invalid-argument' });

    await expect(
      service.add('b1', 'Buffalo Trace', input, 'private')
    ).rejects.toMatchObject({ code: 'functions/invalid-argument' });

    expect(outbox.pending()).toBe(0);
  });

  it('replays a queued sighting through the outbox on flush (BB-182)', async () => {
    // Seed a queued item, as if captured offline in a prior attempt.
    setOnline(false);
    callableFn.mockRejectedValueOnce({ code: 'functions/unavailable' });
    await service.add('b1', 'Buffalo Trace', input, 'private');
    expect(outbox.pending()).toBe(1);

    // Back online: the callable now succeeds and the recompute runs.
    setOnline(true);
    callableFn.mockResolvedValue({ data: { id: 's1' } });
    asMock(getDocs)
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [{ ref: 'entryRef' }] });

    await outbox.flush();

    expect(outbox.pending()).toBe(0);
    expect(updateDoc).toHaveBeenCalledWith('entryRef', {
      bestSightingPrice: 42,
      updatedAt: 'ts',
    });
  });

  it('nearbySightings merges own + friends and dedupes by id (BB-179)', async () => {
    const snap = (
      docs: { id: string; data?: Record<string, unknown> }[]
    ) => ({ docs: docs.map((d) => ({ id: d.id, data: () => d.data ?? {} })) });
    asMock(getDocs)
      // own
      .mockResolvedValueOnce(snap([{ id: 's1', data: { bourbonName: 'A' } }]))
      // friends' shared (s1 repeats, s2 is new)
      .mockResolvedValueOnce(snap([{ id: 's1' }, { id: 's2' }]));

    const items = await service.nearbySightings(['f1'], 'u1');

    expect(items.map((s) => s.id).sort()).toEqual(['s1', 's2']);
  });

  it('nearbySightings skips the friends query when there are no friends', async () => {
    asMock(getDocs).mockResolvedValueOnce({
      docs: [{ id: 's1', data: () => ({}) }],
    });
    const items = await service.nearbySightings([], 'u1');
    expect(getDocs).toHaveBeenCalledTimes(1);
    expect(items).toHaveLength(1);
  });
});
