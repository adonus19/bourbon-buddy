import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { Timestamp } from '@angular/fire/firestore';

import { StoreDetailPage } from './store-detail.page';
import { PriceHistoryPoint, StoreNote } from '../../../models';
import { BourbonCatalogService } from '../../../core/services/bourbon-catalog.service';
import { PriceHistoryService } from '../../../core/services/price-history.service';
import { StoreNotesService } from '../../../core/services/store-notes.service';

const NOW = Date.now();
const DAY_MS = 24 * 60 * 60 * 1000;

const store: StoreNote = {
  id: 's1',
  name: 'Total Wine',
  nameNormalized: 'total wine',
  city: 'Louisville',
  state: 'KY',
  priceTier: 'fair',
  specialties: ['store-picks'],
  createdAt: Timestamp.fromMillis(NOW),
  updatedAt: Timestamp.fromMillis(NOW),
};

const point = (over: Partial<PriceHistoryPoint> = {}): PriceHistoryPoint =>
  ({
    id: Math.random().toString(36).slice(2),
    bourbonId: 'b1',
    price: 110,
    sightingDate: Timestamp.fromMillis(NOW),
    storeName: 'Total Wine',
    spotterUid: 'me',
    visibility: 'private',
    createdAt: Timestamp.fromMillis(NOW),
    ...over,
  }) as PriceHistoryPoint;

function configure(opts: {
  store?: StoreNote | undefined;
  points?: PriceHistoryPoint[];
  bottles?: Record<string, { id: string; name: string; msrp?: number | null }>;
  forStore?: jest.Mock;
}) {
  const priceHistoryForStore =
    opts.forStore ?? jest.fn(() => Promise.resolve(opts.points ?? []));
  const bottles = opts.bottles ?? {};
  TestBed.configureTestingModule({
    declarations: [StoreDetailPage],
    schemas: [NO_ERRORS_SCHEMA],
    providers: [
      {
        provide: StoreNotesService,
        useValue: {
          loaded: signal(true),
          selectById: () => signal(opts.store),
        },
      },
      { provide: PriceHistoryService, useValue: { priceHistoryForStore } },
      {
        provide: BourbonCatalogService,
        useValue: {
          getById: jest.fn((id: string) =>
            Promise.resolve(bottles[id] ?? null)
          ),
        },
      },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: { get: () => 's1' } } },
      },
    ],
  });
  const fixture = TestBed.createComponent(StoreDetailPage);
  return { fixture, cmp: fixture.componentInstance, priceHistoryForStore };
}

/** Runs the load effect and lets its async read settle. */
async function settle(fixture: { detectChanges: () => void }) {
  fixture.detectChanges();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('StoreDetailPage (BB-224)', () => {
  it('reads price history for the store once the note arrives', async () => {
    const { fixture, priceHistoryForStore } = configure({ store });
    await settle(fixture);
    expect(priceHistoryForStore).toHaveBeenCalledWith('Total Wine');
  });

  it('does not read anything when the store note is missing', async () => {
    const { fixture, cmp, priceHistoryForStore } = configure({
      store: undefined,
    });
    await settle(fixture);
    expect(priceHistoryForStore).not.toHaveBeenCalled();
    expect(cmp.hasEvidence()).toBe(false);
  });

  it('reads only once even when change detection runs again', async () => {
    const { fixture, priceHistoryForStore } = configure({ store });
    await settle(fixture);
    await settle(fixture);
    expect(priceHistoryForStore).toHaveBeenCalledTimes(1);
  });

  it('computes evidence with MSRP context from the catalog', async () => {
    const { fixture, cmp } = configure({
      store,
      points: [point({ bourbonId: 'b1', price: 110 })],
      bottles: { b1: { id: 'b1', name: 'Weller 12', msrp: 100 } },
    });
    await settle(fixture);
    expect(cmp.evidence().visitCount).toBe(1);
    expect(cmp.evidence().bottlesSpotted).toBe(1);
    expect(cmp.evidence().avgPctVsMsrp).toBeCloseTo(10);
  });

  it('lists only sightings inside the 30-day live window', async () => {
    const { fixture, cmp } = configure({
      store,
      points: [
        point({ bourbonId: 'b1' }),
        point({
          bourbonId: 'b2',
          sightingDate: Timestamp.fromMillis(NOW - 45 * DAY_MS),
        }),
      ],
      bottles: {
        b1: { id: 'b1', name: 'Weller 12', msrp: 100 },
        b2: { id: 'b2', name: 'Old Forester' },
      },
    });
    await settle(fixture);
    expect(cmp.liveSightings().map((r) => r.bottleName)).toEqual(['Weller 12']);
  });

  it('survives a failed evidence read without breaking the intel', async () => {
    const { fixture, cmp } = configure({
      store,
      forStore: jest.fn(() => Promise.reject(new Error('offline'))),
    });
    await settle(fixture);
    expect(cmp.hasEvidence()).toBe(false);
    expect(cmp.evidenceLoading()).toBe(false);
  });

  it('phrases MSRP deltas with direction, never a bare number', () => {
    const { cmp } = configure({ store });
    expect(cmp.msrpPhrase(12.4)).toBe('12% over MSRP');
    expect(cmp.msrpPhrase(-5)).toBe('5% under MSRP');
    expect(cmp.msrpPhrase(0)).toBe('at MSRP');
    expect(cmp.msrpPhrase(null)).toBeNull();
  });
});
