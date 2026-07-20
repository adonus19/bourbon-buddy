import { TestBed } from '@angular/core/testing';

jest.mock('@angular/fire/firestore', () => ({
  Firestore: class {},
  addDoc: jest.fn(() => Promise.resolve({ id: 'new' })),
  arrayUnion: jest.fn((v: unknown) => ({ __arrayUnion: v })),
  collection: jest.fn(() => 'col'),
  doc: jest.fn((_fs: unknown, col: string, id: string) => ({ col, id })),
  endAt: jest.fn(() => 'endAt'),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  limit: jest.fn(() => 'limit'),
  orderBy: jest.fn(() => 'orderBy'),
  query: jest.fn((...a: unknown[]) => a),
  serverTimestamp: jest.fn(() => 'ts'),
  startAt: jest.fn(() => 'startAt'),
  updateDoc: jest.fn(() => Promise.resolve()),
  where: jest.fn((field: string, op: string, val: unknown) => ({
    field,
    op,
    val,
  })),
}));
jest.mock('@angular/fire/functions', () => ({
  Functions: class {},
  httpsCallable: jest.fn(),
}));

import {
  Firestore,
  getDoc,
  getDocs,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { AuthService } from '../auth/auth.service';
import { BourbonCatalogService } from './bourbon-catalog.service';

const asMock = (fn: unknown) => fn as jest.Mock;

describe('BourbonCatalogService — UPC index (BB-175)', () => {
  let service: BourbonCatalogService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        BourbonCatalogService,
        { provide: Firestore, useValue: {} },
        { provide: Functions, useValue: {} },
        { provide: AuthService, useValue: { snapshotUser: { uid: 'u1' } } },
      ],
    });
    service = TestBed.inject(BourbonCatalogService);
  });

  afterEach(() => jest.clearAllMocks());

  // BB-228c: opening the bottle preview sheet fired getById for the SAME doc
  // twice — once from the sheet, once from its similar-bottles child, ~5ms
  // apart (measured in BB-228a). These collapse that to one read.
  describe('getById caching (BB-228c)', () => {
    const snapshot = (id: string, data: Record<string, unknown> = {}) => ({
      exists: () => true,
      id,
      data: () => data,
    });

    it('collapses concurrent reads of the same doc into one fetch', async () => {
      let release!: (v: unknown) => void;
      asMock(getDoc).mockReturnValue(
        new Promise((resolve) => {
          release = resolve;
        })
      );

      const a = service.getById('b1');
      const b = service.getById('b1');
      release(snapshot('b1', { name: 'Weller 12' }));
      const [first, second] = await Promise.all([a, b]);

      expect(asMock(getDoc)).toHaveBeenCalledTimes(1);
      expect(first?.name).toBe('Weller 12');
      expect(second).toEqual(first);
    });

    it('serves a repeat read from cache without refetching', async () => {
      asMock(getDoc).mockResolvedValue(snapshot('b1', { name: 'Weller 12' }));

      await service.getById('b1');
      const again = await service.getById('b1');

      expect(asMock(getDoc)).toHaveBeenCalledTimes(1);
      expect(again?.name).toBe('Weller 12');
    });

    it('caches a miss so a bottle with no catalog doc is not refetched', async () => {
      asMock(getDoc).mockResolvedValue({ exists: () => false });

      expect(await service.getById('nope')).toBeNull();
      expect(await service.getById('nope')).toBeNull();
      expect(asMock(getDoc)).toHaveBeenCalledTimes(1);
    });

    it('keeps separate ids separate', async () => {
      asMock(getDoc)
        .mockResolvedValueOnce(snapshot('b1', { name: 'One' }))
        .mockResolvedValueOnce(snapshot('b2', { name: 'Two' }));

      expect((await service.getById('b1'))?.name).toBe('One');
      expect((await service.getById('b2'))?.name).toBe('Two');
      expect(asMock(getDoc)).toHaveBeenCalledTimes(2);
    });

    it('does not cache a failed read', async () => {
      asMock(getDoc).mockRejectedValueOnce(new Error('offline'));
      await expect(service.getById('b1')).rejects.toThrow('offline');

      asMock(getDoc).mockResolvedValue(snapshot('b1', { name: 'Weller 12' }));
      expect((await service.getById('b1'))?.name).toBe('Weller 12');
      expect(asMock(getDoc)).toHaveBeenCalledTimes(2);
    });

    it('invalidates the cached doc after addUpc writes to it', async () => {
      asMock(getDoc).mockResolvedValue(snapshot('b1', { name: 'Weller 12' }));
      await service.getById('b1');
      await service.addUpc('b1', '012345678905');
      await service.getById('b1');

      // The write changed the doc, so the next read must hit the server.
      expect(asMock(getDoc)).toHaveBeenCalledTimes(2);
    });
  });

  describe('getFlavorSuggestions (BB-186)', () => {
    const callWith = (data: unknown) => {
      const callable = jest.fn().mockResolvedValue({ data });
      asMock(httpsCallable).mockReturnValue(callable);
      return callable;
    };

    it('returns the canonical tags from the enrichBottleFlavor callable', async () => {
      const callable = callWith({
        flavorProfile: { nose: ['Vanilla'], palate: ['Cherry'], finish: ['Oak'] },
      });
      const res = await service.getFlavorSuggestions('b1');
      expect(callable).toHaveBeenCalledWith({ bourbonId: 'b1' });
      expect(res).toEqual({ nose: ['Vanilla'], palate: ['Cherry'], finish: ['Oak'] });
    });

    it('fills missing stages with empty arrays', async () => {
      callWith({ flavorProfile: { palate: ['Corn'] } });
      expect(await service.getFlavorSuggestions('b1')).toEqual({
        nose: [],
        palate: ['Corn'],
        finish: [],
      });
    });

    it('returns null for an empty or absent profile', async () => {
      callWith({ flavorProfile: null });
      expect(await service.getFlavorSuggestions('b1')).toBeNull();
      callWith({ flavorProfile: { nose: [], palate: [], finish: [] } });
      expect(await service.getFlavorSuggestions('b1')).toBeNull();
    });

    it('returns null without calling out for a blank id', async () => {
      const callable = callWith({ flavorProfile: { nose: ['Oak'] } });
      expect(await service.getFlavorSuggestions('')).toBeNull();
      expect(callable).not.toHaveBeenCalled();
    });

    it('swallows callable errors and returns null (never blocks logging)', async () => {
      const callable = jest.fn().mockRejectedValue(new Error('offline'));
      asMock(httpsCallable).mockReturnValue(callable);
      expect(await service.getFlavorSuggestions('b1')).toBeNull();
    });
  });

  describe('findByUpc', () => {
    it('returns the matching bottle on a hit', async () => {
      asMock(getDocs).mockResolvedValue({
        empty: false,
        docs: [{ id: 'b1', data: () => ({ name: 'Buffalo Trace' }) }],
      });

      const res = await service.findByUpc('012345678905');

      expect(res).toEqual({ id: 'b1', name: 'Buffalo Trace' });
      expect(where).toHaveBeenCalledWith(
        'upc',
        'array-contains',
        '012345678905'
      );
    });

    it('normalizes the code before querying', async () => {
      asMock(getDocs).mockResolvedValue({ empty: true, docs: [] });
      await service.findByUpc('0-12345-67890-5');
      expect(where).toHaveBeenCalledWith(
        'upc',
        'array-contains',
        '012345678905'
      );
    });

    it('returns null on a miss', async () => {
      asMock(getDocs).mockResolvedValue({ empty: true, docs: [] });
      expect(await service.findByUpc('012345678905')).toBeNull();
    });

    it('returns null without querying for a malformed code', async () => {
      expect(await service.findByUpc('12')).toBeNull();
      expect(getDocs).not.toHaveBeenCalled();
    });
  });

  describe('addUpc', () => {
    it('appends the normalized code via arrayUnion', async () => {
      await service.addUpc('b1', '0 12345 67890 5');
      expect(updateDoc).toHaveBeenCalledWith(
        { col: 'bourbons', id: 'b1' },
        { upc: { __arrayUnion: '012345678905' } }
      );
    });

    it('no-ops on a malformed code', async () => {
      await service.addUpc('b1', 'not-a-code');
      expect(updateDoc).not.toHaveBeenCalled();
    });
  });
});
