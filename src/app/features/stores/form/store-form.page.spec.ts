import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

jest.mock('@ionic/angular', () => ({ ToastController: class {} }));

import { ToastController } from '@ionic/angular';
import { StoreFormPage } from './store-form.page';
import { StoreNotesService } from '../../../core/services/store-notes.service';
import { PriceHistoryService } from '../../../core/services/price-history.service';

function configure(opts: {
  editId?: string | null;
  queryParams?: Record<string, string | null>;
  add?: jest.Mock;
  update?: jest.Mock;
  recentOwnPoints?: jest.Mock;
  stores?: unknown[];
}) {
  const q = opts.queryParams ?? {};
  const route = {
    snapshot: {
      paramMap: { get: () => opts.editId ?? null },
      queryParamMap: { get: (k: string) => q[k] ?? null },
    },
  };
  const navigateByUrl = jest.fn(() => Promise.resolve(true));
  TestBed.configureTestingModule({
    imports: [ReactiveFormsModule],
    declarations: [StoreFormPage],
    schemas: [NO_ERRORS_SCHEMA],
    providers: [
      {
        provide: StoreNotesService,
        useValue: {
          stores: () => opts.stores ?? [],
          selectById: () => signal(undefined),
          add: opts.add ?? jest.fn(() => Promise.resolve('new-id')),
          update: opts.update ?? jest.fn(() => Promise.resolve()),
        },
      },
      { provide: ActivatedRoute, useValue: route },
      {
        provide: PriceHistoryService,
        useValue: {
          recentOwnPoints:
            opts.recentOwnPoints ?? jest.fn(() => Promise.resolve([])),
        },
      },
      { provide: Router, useValue: { navigateByUrl } },
      {
        provide: ToastController,
        useValue: { create: async () => ({ present: async () => undefined }) },
      },
    ],
  });
  const cmp = TestBed.createComponent(StoreFormPage).componentInstance;
  return { cmp, navigateByUrl };
}

describe('StoreFormPage (BB-223)', () => {
  it('requires a name', () => {
    const { cmp } = configure({});
    expect(cmp.form.invalid).toBe(true);
    cmp.form.controls.name.setValue('Total Wine');
    expect(cmp.form.valid).toBe(true);
  });

  it('does not save an invalid (nameless) form', async () => {
    const add = jest.fn(() => Promise.resolve('x'));
    const { cmp } = configure({ add });
    await cmp.save();
    expect(add).not.toHaveBeenCalled();
  });

  it('toggles specialty chips on and off', () => {
    const { cmp } = configure({});
    expect(cmp.isSpecialtySelected('barrel-picks')).toBe(false);
    cmp.toggleSpecialty('barrel-picks');
    expect(cmp.isSpecialtySelected('barrel-picks')).toBe(true);
    cmp.toggleSpecialty('barrel-picks');
    expect(cmp.isSpecialtySelected('barrel-picks')).toBe(false);
  });

  it('saves a valid new store, then returns to the list', async () => {
    const add = jest.fn(() => Promise.resolve('new-id'));
    const { cmp, navigateByUrl } = configure({ add });
    cmp.form.controls.name.setValue('  Liquor Barn  ');
    cmp.form.controls.city.setValue('Lexington');
    cmp.form.controls.priceTier.setValue('underpriced');
    cmp.toggleSpecialty('allocated');
    await cmp.save();
    expect(add).toHaveBeenCalledWith({
      name: 'Liquor Barn', // trimmed
      placeId: null,
      city: 'Lexington',
      state: null,
      priceTier: 'underpriced',
      specialties: ['allocated'],
      shipmentNotes: null,
      notes: null,
    });
    expect(navigateByUrl).toHaveBeenCalledWith('/stores', { replaceUrl: true });
  });

  it('prefills name/city/state from query params (BB-225 handoff)', () => {
    const { cmp } = configure({
      queryParams: { name: 'Party Source', city: 'Bellevue', state: 'KY' },
    });
    expect(cmp.form.controls.name.value).toBe('Party Source');
    expect(cmp.form.controls.city.value).toBe('Bellevue');
    expect(cmp.form.controls.state.value).toBe('KY');
  });
});

describe('StoreFormPage — recent store suggestions (BB-225)', () => {
  const point = (name: string, city: string, agoDays: number) => ({
    bourbonId: 'b1',
    price: 50,
    sightingDate: { toMillis: () => Date.now() - agoDays * 86400000 },
    storeName: name,
    city,
    state: 'KY',
    spotterUid: 'me',
    visibility: 'private',
  });

  /** Lets the constructor's suggestion read settle. */
  const settle = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };

  it('offers recent stores, newest first, when starting from scratch', async () => {
    const { cmp } = configure({
      recentOwnPoints: jest.fn(() =>
        Promise.resolve([
          point('Liquor Barn', 'Lexington', 9),
          point('Westport Whiskey', 'Louisville', 1),
        ])
      ),
    });
    await settle();
    expect(cmp.recentStores().map((s) => s.name)).toEqual([
      'Westport Whiskey',
      'Liquor Barn',
    ]);
  });

  it('does not offer suggestions when the form arrived prefilled (handoff)', async () => {
    const recentOwnPoints = jest.fn(() => Promise.resolve([]));
    configure({
      queryParams: { name: 'Westport Whiskey', city: 'Louisville' },
      recentOwnPoints,
    });
    await settle();
    expect(recentOwnPoints).not.toHaveBeenCalled();
  });

  it('does not read price history in edit mode', async () => {
    const recentOwnPoints = jest.fn(() => Promise.resolve([]));
    configure({ editId: 's1', recentOwnPoints });
    await settle();
    expect(recentOwnPoints).not.toHaveBeenCalled();
  });

  it('tapping a suggestion fills the location and clears the list', async () => {
    const { cmp } = configure({
      recentOwnPoints: jest.fn(() =>
        Promise.resolve([point('Westport Whiskey', 'Louisville', 1)])
      ),
    });
    await settle();
    cmp.useRecentStore(cmp.recentStores()[0]);
    expect(cmp.form.controls.name.value).toBe('Westport Whiskey');
    expect(cmp.form.controls.city.value).toBe('Louisville');
    expect(cmp.recentStores()).toEqual([]);
  });

  it('survives a failed suggestion read', async () => {
    const { cmp } = configure({
      recentOwnPoints: jest.fn(() => Promise.reject(new Error('offline'))),
    });
    await settle();
    expect(cmp.recentStores()).toEqual([]);
  });
});

describe('StoreFormPage — suggestions skip already-noted stores (BB-225)', () => {
  it('omits a recent store the user already wrote a note for', async () => {
    const { cmp } = configure({
      stores: [
        {
          id: 's1',
          name: 'Westport Whiskey',
          nameNormalized: 'westport whiskey',
          placeId: null,
          city: 'Louisville',
          specialties: [],
        } as any,
      ],
      recentOwnPoints: jest.fn(() =>
        Promise.resolve([
          {
            bourbonId: 'b1',
            price: 50,
            sightingDate: { toMillis: () => Date.now() },
            storeName: 'Westport Whiskey',
            city: 'Louisville',
            state: 'KY',
            spotterUid: 'me',
            visibility: 'private',
          },
          {
            bourbonId: 'b1',
            price: 50,
            sightingDate: { toMillis: () => Date.now() - 86400000 },
            storeName: 'Party Source',
            city: 'Bellevue',
            state: 'KY',
            spotterUid: 'me',
            visibility: 'private',
          },
        ])
      ),
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(cmp.recentStores().map((s) => s.name)).toEqual(['Party Source']);
  });
});
