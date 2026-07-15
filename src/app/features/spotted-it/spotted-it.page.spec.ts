import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

jest.mock('@ionic/angular', () => ({ ToastController: class {} }));
jest.mock('@angular/fire/firestore', () => ({
  Firestore: class {},
  Timestamp: { fromDate: jest.fn(), now: jest.fn() },
  collection: jest.fn(),
  doc: jest.fn(),
  addDoc: jest.fn(),
  getDocs: jest.fn(),
  updateDoc: jest.fn(),
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
import { SpottedItPage } from './spotted-it.page';
import { BourbonCatalogService } from '../../core/services/bourbon-catalog.service';
import { SightingService } from '../../core/services/sighting.service';
import { BarcodeScannerService } from '../../core/services/barcode-scanner.service';
import { GeolocationService } from '../../core/services/geolocation.service';
import { AuthService } from '../../core/auth/auth.service';

interface Testable {
  loadNearbyStores(coords: { lat: number; lng: number }): Promise<void>;
  selectStore(store: unknown): void;
  nearbyStores(): { name: string }[];
  storesLoaded(): boolean;
  form: { controls: Record<string, { value: unknown }> };
}

function configure(
  geo: Partial<GeolocationService>,
  opts: {
    queryParams?: Record<string, string>;
    router?: Partial<Router>;
    sightings?: Partial<SightingService>;
  } = {}
): SpottedItPage {
  TestBed.configureTestingModule({
    imports: [ReactiveFormsModule],
    declarations: [SpottedItPage],
    schemas: [NO_ERRORS_SCHEMA],
    providers: [
      { provide: BourbonCatalogService, useValue: {} },
      { provide: SightingService, useValue: opts.sightings ?? {} },
      { provide: BarcodeScannerService, useValue: {} },
      { provide: GeolocationService, useValue: geo },
      { provide: AuthService, useValue: { profile: () => null } },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            queryParamMap: {
              get: (k: string) => opts.queryParams?.[k] ?? null,
            },
          },
        },
      },
      { provide: Router, useValue: opts.router ?? {} },
      { provide: ToastController, useValue: { create: async () => ({ present: async () => undefined }) } },
    ],
  });
  return TestBed.createComponent(SpottedItPage).componentInstance;
}
const testable = (c: SpottedItPage) => c as unknown as Testable;

describe('SpottedItPage — nearby retailer picker (BB-187)', () => {
  afterEach(() => jest.clearAllMocks());

  it('loads nearby stores and marks the lookup complete', async () => {
    const c = testable(
      configure({
        nearbyRetailers: jest
          .fn()
          .mockResolvedValue([{ name: 'Total Wine', lat: 1, lng: 2, kind: 'wine', city: null, state: null }]),
      })
    );

    await c.loadNearbyStores({ lat: 42.5, lng: -71.1 });

    expect(c.nearbyStores().map((s) => s.name)).toEqual(['Total Wine']);
    expect(c.storesLoaded()).toBe(true);
  });

  it('selecting a store fills the store name', () => {
    const c = testable(configure({}));
    c.selectStore({ name: 'Bottle Barn', lat: 1, lng: 2, kind: 'wine', city: null, state: null });
    expect(c.form.controls['storeName'].value).toBe('Bottle Barn');
  });

  it('fills city/state from the store only when OSM provides them', () => {
    const c = testable(configure({}));

    // City absent, state present: state is set, city is left as-is.
    c.selectStore({ name: 'A', lat: 1, lng: 2, kind: 'wine', city: null, state: 'MA' });
    expect(c.form.controls['state'].value).toBe('MA');
    expect(c.form.controls['city'].value).toBe('');

    // Both present: both are set.
    c.selectStore({ name: 'B', lat: 1, lng: 2, kind: 'wine', city: 'Lowell', state: 'MA' });
    expect(c.form.controls['city'].value).toBe('Lowell');
  });
});

describe('SpottedItPage — bottle-context deep link', () => {
  afterEach(() => jest.clearAllMocks());

  it('prefills the bottle from bourbonName/bourbonId query params', () => {
    const c = testable(
      configure({}, { queryParams: { bourbonName: 'Eagle Rare', bourbonId: 'er10' } })
    );
    expect(c.form.controls['bourbonName'].value).toBe('Eagle Rare');
    expect(c.form.controls['bourbonId'].value).toBe('er10');
  });

  it('leaves the form empty without query params', () => {
    const c = testable(configure({}));
    expect(c.form.controls['bourbonName'].value).toBe('');
    expect(c.form.controls['bourbonId'].value).toBe('');
  });

  async function saveWith(returnTo?: string): Promise<jest.Mock> {
    const navigateByUrl = jest.fn().mockResolvedValue(true);
    const page = configure(
      {},
      {
        queryParams: {
          bourbonName: 'Eagle Rare',
          bourbonId: 'er10',
          ...(returnTo ? { returnTo } : {}),
        },
        router: { navigateByUrl } as Partial<Router>,
        sightings: { add: jest.fn().mockResolvedValue('saved') },
      }
    );
    page.form.patchValue({ storeName: 'Total Wine', price: 39.99 });
    await page.save();
    return navigateByUrl;
  }

  it('returns to returnTo after saving (back to the wishlist detail)', async () => {
    const navigateByUrl = await saveWith('/wishlist/abc123');
    expect(navigateByUrl).toHaveBeenCalledWith('/wishlist/abc123', {
      replaceUrl: true,
    });
  });

  it('falls back to the Hunt List without a returnTo', async () => {
    const navigateByUrl = await saveWith();
    expect(navigateByUrl).toHaveBeenCalledWith('/tabs/hunt-list', {
      replaceUrl: true,
    });
  });
});
