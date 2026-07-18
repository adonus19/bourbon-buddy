import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

jest.mock('@angular/fire/firestore', () => ({
  Firestore: class {},
  addDoc: jest.fn(() => Promise.resolve({ id: 'new-store' })),
  collection: jest.fn((_fs: unknown, path: string) => ({ path })),
  collectionData: jest.fn(() => of([])),
  deleteDoc: jest.fn(() => Promise.resolve()),
  doc: jest.fn((_fs: unknown, path: string) => ({ path })),
  orderBy: jest.fn(() => 'orderBy'),
  query: jest.fn((...a: unknown[]) => a),
  serverTimestamp: jest.fn(() => 'ts'),
  updateDoc: jest.fn(() => Promise.resolve()),
}));

import {
  Firestore,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
} from '@angular/fire/firestore';
import { AuthService } from '../auth/auth.service';
import { StoreInput, StoreNotesService } from './store-notes.service';

const asMock = (fn: unknown) => fn as jest.Mock;

const input = (over: Partial<StoreInput> = {}): StoreInput => ({
  name: "Total Wine & More",
  placeId: null,
  city: 'Louisville',
  state: 'KY',
  priceTier: 'fair',
  specialties: ['barrel-picks'],
  shipmentNotes: null,
  notes: null,
  ...over,
});

describe('StoreNotesService (BB-223)', () => {
  let service: StoreNotesService;

  beforeEach(() => {
    jest.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        StoreNotesService,
        { provide: Firestore, useValue: {} },
        {
          provide: AuthService,
          useValue: { currentUser$: of(null), snapshotUser: { uid: 'u1' } },
        },
      ],
    });
    service = TestBed.inject(StoreNotesService);
  });

  it('adds a store, deriving nameNormalized + timestamps', async () => {
    const id = await service.add(input());
    expect(id).toBe('new-store');
    const [, payload] = asMock(addDoc).mock.calls[0];
    expect(payload.nameNormalized).toBe('total wine more'); // "&" folded away
    expect(payload.name).toBe('Total Wine & More');
    expect(payload.createdAt).toBe('ts');
    expect(payload.updatedAt).toBe('ts');
    expect(payload.priceTier).toBe('fair');
  });

  it('updates a store, re-deriving nameNormalized', async () => {
    await service.update('s1', input({ name: 'Liquor Barn' }));
    const [, payload] = asMock(updateDoc).mock.calls[0];
    expect(payload.nameNormalized).toBe('liquor barn');
    expect(payload.updatedAt).toBe('ts');
    expect(asMock(doc).mock.calls[0][1]).toBe('users/u1/stores/s1');
  });

  it('removes a store', async () => {
    await service.remove('s1');
    expect(deleteDoc).toHaveBeenCalled();
    expect(asMock(doc).mock.calls[0][1]).toBe('users/u1/stores/s1');
  });

  it('throws on a write when signed out', async () => {
    (TestBed.inject(AuthService) as unknown as { snapshotUser: unknown }).snapshotUser =
      null;
    await expect(service.add(input())).rejects.toThrow('Not signed in.');
  });
});
