import { TestBed } from '@angular/core/testing';

jest.mock('@angular/fire/firestore', () => ({
  Firestore: class {},
  addDoc: jest.fn(() => Promise.resolve({ id: 'new' })),
  arrayUnion: jest.fn((v: unknown) => ({ __arrayUnion: v })),
  collection: jest.fn(() => 'col'),
  doc: jest.fn((_fs: unknown, col: string, id: string) => ({ col, id })),
  endAt: jest.fn(() => 'endAt'),
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
