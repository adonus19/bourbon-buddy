import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';

jest.mock('@ionic/angular', () => ({
  AlertController: class {},
  ModalController: class {},
  ToastController: class {},
}));
jest.mock('@angular/fire/firestore', () => ({
  Firestore: class {},
  Timestamp: { fromDate: jest.fn(), now: jest.fn() },
  collection: jest.fn(),
  collectionData: jest.fn(),
  doc: jest.fn(),
  docData: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  addDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  serverTimestamp: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
}));
jest.mock('@angular/fire/functions', () => ({
  Functions: class {},
  httpsCallable: jest.fn(),
}));
jest.mock('@angular/fire/auth', () => ({ Auth: class {} }));

import { AlertController, ModalController, ToastController } from '@ionic/angular';

import { WishlistEntry } from '../../../models';
import { WishlistService } from '../../../core/services/wishlist.service';
import { SightingService } from '../../../core/services/sighting.service';
import { BourbonCatalogService } from '../../../core/services/bourbon-catalog.service';
import { WishlistDetailPage } from './wishlist-detail.page';

const entryOf = (over: Partial<WishlistEntry> = {}): WishlistEntry =>
  ({
    id: 'wl-1',
    bourbonId: 'b1',
    bourbonName: 'Elijah Craig Barrel Proof',
    distillery: 'Heaven Hill',
    category: 'bourbon',
    status: 'actively_looking',
    priority: 'normal',
    reviewLinks: [],
    ...over,
  }) as WishlistEntry;

describe('WishlistDetailPage — loading state (BB-236)', () => {
  let fixture: ComponentFixture<WishlistDetailPage>;
  const entry = signal<WishlistEntry | undefined>(undefined);
  const loaded = signal(false);

  beforeEach(() => {
    entry.set(undefined);
    loaded.set(false);

    TestBed.configureTestingModule({
      declarations: [WishlistDetailPage],
      providers: [
        {
          provide: WishlistService,
          useValue: {
            selectById: () => entry,
            loaded,
            entries: signal([]),
            setBestSightingPrice: jest.fn(),
          },
        },
        { provide: SightingService, useValue: { sightingsForBottle: () => of([]) } },
        { provide: BourbonCatalogService, useValue: { getById: jest.fn().mockResolvedValue(null) } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => 'wl-1' }, parent: null } },
        },
        { provide: Router, useValue: { navigate: jest.fn(), navigateByUrl: jest.fn() } },
        { provide: AlertController, useValue: {} },
        { provide: ModalController, useValue: {} },
        { provide: ToastController, useValue: {} },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });
    fixture = TestBed.createComponent(WishlistDetailPage);
  });

  const q = (sel: string) => fixture.nativeElement.querySelector(sel);

  it('shows a skeleton (not the "not found" state) while the list is still loading', () => {
    loaded.set(false);
    entry.set(undefined);
    fixture.detectChanges();

    expect(q('.wdetail-loading')).toBeTruthy();
    expect(q('.wdetail-missing')).toBeNull();
    expect(q('.wdetail')).toBeNull();
  });

  it('shows the "not found" state only once the list has loaded and the entry is absent', () => {
    loaded.set(true);
    entry.set(undefined);
    fixture.detectChanges();

    expect(q('.wdetail-missing')).toBeTruthy();
    expect(q('.wdetail-loading')).toBeNull();
  });

  it('renders the entry once it resolves, with no skeleton or missing state', () => {
    loaded.set(true);
    entry.set(entryOf());
    fixture.detectChanges();

    expect(q('.wdetail')).toBeTruthy();
    expect(q('.wdetail-loading')).toBeNull();
    expect(q('.wdetail-missing')).toBeNull();
  });
});
