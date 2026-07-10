import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

jest.mock('@ionic/angular', () => ({ ToastController: class {} }));
jest.mock('@angular/fire/firestore', () => ({
  Firestore: class {},
  Timestamp: { fromDate: jest.fn(), now: jest.fn() },
  collection: jest.fn(),
  collectionData: jest.fn(),
  doc: jest.fn(),
  addDoc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  arrayUnion: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  startAt: jest.fn(),
  endAt: jest.fn(),
  serverTimestamp: jest.fn(),
}));
jest.mock('@angular/fire/functions', () => ({
  Functions: class {},
  httpsCallable: jest.fn(),
}));
jest.mock('@angular/fire/auth', () => ({ Auth: class {} }));

import { ToastController } from '@ionic/angular';

import { SimilarBottle } from '../../../models';
import { BourbonCatalogService } from '../../../core/services/bourbon-catalog.service';
import { LogEntryService } from '../../../core/services/log-entry.service';
import { WishlistService } from '../../../core/services/wishlist.service';
import { SimilarBottlesComponent } from './similar-bottles.component';

const neighbor = (id: string, name = id): SimilarBottle => ({
  bourbonId: id,
  name,
  category: 'bourbon',
  sharedTags: ['Cherry', 'Oak'],
});

describe('SimilarBottlesComponent (BB-197)', () => {
  let fixture: ComponentFixture<SimilarBottlesComponent>;
  let component: SimilarBottlesComponent;
  let catalog: { getById: jest.Mock };
  let wishlist: { entries: ReturnType<typeof signal>; add: jest.Mock };
  let log: { entries: ReturnType<typeof signal> };

  beforeEach(() => {
    catalog = { getById: jest.fn().mockResolvedValue(null) };
    wishlist = { entries: signal([] as unknown[]), add: jest.fn() };
    log = { entries: signal([] as unknown[]) };

    TestBed.configureTestingModule({
      declarations: [SimilarBottlesComponent],
      providers: [
        { provide: BourbonCatalogService, useValue: catalog },
        { provide: WishlistService, useValue: wishlist },
        { provide: LogEntryService, useValue: log },
        {
          provide: ToastController,
          useValue: {
            create: jest
              .fn()
              .mockResolvedValue({ present: jest.fn().mockResolvedValue(undefined) }),
          },
        },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });
    fixture = TestBed.createComponent(SimilarBottlesComponent);
    component = fixture.componentInstance;
  });

  it('loads the precomputed neighbors for the given bottle', async () => {
    catalog.getById.mockResolvedValue({
      id: 'b1',
      similarBottles: [neighbor('n1'), neighbor('n2')],
    });
    component.bourbonId = 'b1';
    await fixture.whenStable();
    expect(catalog.getById).toHaveBeenCalledWith('b1');
    expect(component.neighbors().map((n) => n.bourbonId)).toEqual(['n1', 'n2']);
  });

  it('renders nothing (empty neighbors) when the bottle has none or the read fails', async () => {
    catalog.getById.mockRejectedValue(new Error('offline'));
    component.bourbonId = 'b1';
    await fixture.whenStable();
    expect(component.neighbors()).toEqual([]);
  });

  it('marks cellar and hunt-list bottles from the state-holder signals', () => {
    log.entries.set([{ bourbonId: 'owned' }]);
    wishlist.entries.set([
      { bourbonId: 'hunted', status: 'actively_looking' },
      { bourbonId: 'archived', status: 'logged' },
    ]);
    expect(component.cellarIds().has('owned')).toBe(true);
    expect(component.huntIds().has('hunted')).toBe(true);
    expect(component.huntIds().has('archived')).toBe(false); // logged = inactive
  });

  it('adds a neighbor to the hunt list with the discovery source', async () => {
    wishlist.add.mockResolvedValue('id');
    await component.add(neighbor('n1', 'Rittenhouse'));
    expect(wishlist.add).toHaveBeenCalledWith(
      expect.objectContaining({
        bourbonId: 'n1',
        bourbonName: 'Rittenhouse',
        discoverySource: 'Similar bottles',
      })
    );
  });

  it('never double-adds a bottle already on the active hunt list', async () => {
    wishlist.entries.set([{ bourbonId: 'n1', status: 'actively_looking' }]);
    await component.add(neighbor('n1'));
    expect(wishlist.add).not.toHaveBeenCalled();
  });
});
