import { NO_ERRORS_SCHEMA, WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

jest.mock('@angular/fire/firestore', () => ({
  Firestore: class {},
  Timestamp: { fromMillis: jest.fn(), now: jest.fn() },
  collection: jest.fn(),
  collectionData: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
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

import { Timestamp } from '@angular/fire/firestore';

import { LogEntry, PriceHistoryPoint } from '../../../models';
import { AuthService } from '../../../core/auth/auth.service';
import { FriendService } from '../../../core/services/friend.service';
import { LogEntryService } from '../../../core/services/log-entry.service';
import { PriceHistoryService } from '../../../core/services/price-history.service';
import { PriceHistoryComponent } from './price-history.component';

const DAY = 24 * 60 * 60 * 1000;

/** A minimal owned, priced log entry for the "Your purchases" trend. */
function purchase(price: number, daysAgo: number): LogEntry {
  const ms = Date.now() - daysAgo * DAY;
  const ts = { toMillis: () => ms } as unknown as Timestamp;
  return {
    id: `e${price}`,
    bourbonId: 'b1',
    entryType: 'bottle_purchased',
    didNotPurchase: false,
    purchasePrice: price,
    purchaseDate: ts,
    entryDate: ts,
    bottleStatus: 'open',
    bottleRemainingPct: 100,
    rating: null,
  } as unknown as LogEntry;
}

function pt(
  id: string,
  price: number,
  daysAgo: number,
  over: Partial<PriceHistoryPoint> = {}
): PriceHistoryPoint {
  const ms = Date.now() - daysAgo * DAY;
  return {
    id,
    bourbonId: 'b1',
    price,
    sightingDate: { toMillis: () => ms } as unknown as Timestamp,
    spotterUid: 'me',
    visibility: 'private',
    createdAt: { toMillis: () => 0 } as unknown as Timestamp,
    ...over,
  };
}

describe('PriceHistoryComponent (BB-204)', () => {
  let fixture: ComponentFixture<PriceHistoryComponent>;
  let component: PriceHistoryComponent;
  let priceHistory: { priceHistoryForBottle: jest.Mock };
  let friends: { friendsOnce: jest.Mock };
  let log: { entries: WritableSignal<LogEntry[]> };

  /**
   * Creates the component and deterministically awaits its async load by
   * calling ngOnInit directly (whenStable() races the resolved-promise
   * microtasks under jest-preset-angular). No detectChanges — that would re-run
   * ngOnInit; these assertions read component state, which drives the template.
   */
  async function load(
    points: PriceHistoryPoint[],
    msrp: number | null = null
  ): Promise<PriceHistoryComponent> {
    priceHistory.priceHistoryForBottle.mockResolvedValue(points);
    fixture = TestBed.createComponent(PriceHistoryComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('bourbonId', 'b1');
    if (msrp !== null) {
      fixture.componentRef.setInput('msrp', msrp);
    }
    await component.ngOnInit();
    return component;
  }

  beforeEach(() => {
    priceHistory = { priceHistoryForBottle: jest.fn().mockResolvedValue([]) };
    friends = { friendsOnce: jest.fn().mockResolvedValue([]) };
    log = { entries: signal<LogEntry[]>([]) };

    TestBed.configureTestingModule({
      declarations: [PriceHistoryComponent],
      providers: [
        { provide: PriceHistoryService, useValue: priceHistory },
        { provide: FriendService, useValue: friends },
        { provide: AuthService, useValue: { snapshotUser: { uid: 'me' } } },
        { provide: LogEntryService, useValue: log },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });
  });

  it('passes the viewer’s friend UIDs to the read service and clears loading', async () => {
    friends.friendsOnce.mockResolvedValue([{ uid: 'f1' }, { uid: 'f2' }]);
    const c = await load([]);
    expect(priceHistory.priceHistoryForBottle).toHaveBeenCalledWith('b1', [
      'f1',
      'f2',
    ]);
    expect(c.loading()).toBe(false);
  });

  it('reports no data (empty state) when the read returns nothing', async () => {
    const c = await load([]);
    expect(c.hasData()).toBe(false);
    expect(c.stats()).toBeNull();
  });

  it('falls back to the empty state when the read fails', async () => {
    priceHistory.priceHistoryForBottle.mockRejectedValue(new Error('offline'));
    fixture = TestBed.createComponent(PriceHistoryComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('bourbonId', 'b1');
    await component.ngOnInit();
    expect(component.hasData()).toBe(false);
    expect(component.loading()).toBe(false);
  });

  it('computes the summary stats (count / min / max / median)', async () => {
    const c = await load([pt('a', 50, 2), pt('b', 30, 5), pt('c', 70, 9)]);
    expect(c.hasData()).toBe(true);
    expect(c.stats()).toEqual({ count: 3, min: 30, max: 70, median: 50 });
    expect(c.spanSince()).toBeInstanceOf(Date); // 2+ points → a span
  });

  it('computes the median vs MSRP delta as a signed percentage', async () => {
    const c = await load([pt('a', 60, 1)], 50); // median 60 vs MSRP 50 → +20%
    expect(c.msrpDelta()).toBe(20);
  });

  it('returns no MSRP delta when MSRP is absent or zero', async () => {
    expect((await load([pt('a', 60, 1)])).msrpDelta()).toBeNull();
    expect((await load([pt('a', 60, 1)], 0)).msrpDelta()).toBeNull();
  });

  it('tags own points as mine and others as not, newest-first, with a place', async () => {
    const c = await load([
      pt('old', 40, 20, { spotterUid: 'me', storeName: 'Total Wine' }),
      pt('new', 45, 2, { spotterUid: 'f1', visibility: 'friends', city: 'Raleigh', state: 'NC' }),
    ]);
    const rows = c.rows();
    expect(rows.map((r) => r.id)).toEqual(['new', 'old']); // newest first
    expect(rows[0]).toMatchObject({ mine: false, place: 'Raleigh, NC', fresh: true });
    expect(rows[1]).toMatchObject({ mine: true, place: 'Total Wine', fresh: false });
  });

  it('surfaces the lowest fresh price as "spotted recently", ignoring old points', async () => {
    const c = await load([pt('a', 40, 3), pt('b', 55, 5), pt('old', 20, 60)]);
    expect(c.recentBest()).toBe(40); // 20 is older than FRESH_DAYS, excluded
  });

  it('emits a sparkline only once there are enough points', async () => {
    expect((await load([pt('a', 40, 1), pt('b', 50, 2)])).bars()).toEqual([]);
    const dense = await load([
      pt('a', 40, 4),
      pt('b', 60, 3),
      pt('c', 50, 2),
      pt('d', 70, 1),
    ]);
    expect(dense.bars()).toHaveLength(4);
    expect(dense.bars().every((h) => h >= 8 && h <= 100)).toBe(true);
  });

  // BB-205 — personal purchase-price series
  it('derives the "Your purchases" trend from log entries without blending into the crowd median', async () => {
    log.entries.set([purchase(40, 10), purchase(60, 2)]); // oldest→newest: 40, 60
    const c = await load([pt('a', 50, 2), pt('b', 30, 5), pt('c', 70, 9)]);
    // Crowd median is unchanged by the viewer's purchases.
    expect(c.stats()).toMatchObject({ median: 50 });
    expect(c.hasPurchases()).toBe(true);
    expect(c.purchaseTrend().map((p) => p.price)).toEqual([40, 60]);
    expect(c.purchaseDelta()).toBe(20);
  });

  it('shows a single purchase gracefully (no misleading trend)', async () => {
    log.entries.set([purchase(45, 3)]);
    const c = await load([]); // no crowd data at all
    expect(c.hasData()).toBe(true); // purchases alone are enough to render
    expect(c.hasCrowd()).toBe(false);
    expect(c.hasPurchases()).toBe(true);
    expect(c.purchaseTrend()).toHaveLength(1);
    expect(c.purchaseDelta()).toBeNull();
  });

  it('ignores non-purchase entries and other bottles in the trend', async () => {
    log.entries.set([
      purchase(40, 5),
      { ...purchase(999, 4), didNotPurchase: true } as LogEntry, // not a purchase
      { ...purchase(50, 3), bourbonId: 'other' } as LogEntry, // different bottle
    ]);
    const c = await load([]);
    expect(c.purchaseTrend().map((p) => p.price)).toEqual([40]);
  });
});
