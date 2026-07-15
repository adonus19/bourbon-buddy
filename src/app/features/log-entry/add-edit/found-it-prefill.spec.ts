import { Bourbon, LogEntry, WishlistEntry } from '../../../models';
import { foundItPrefill } from './found-it-prefill';

const TODAY = '2026-07-15';

function wish(over: Partial<WishlistEntry> = {}): WishlistEntry {
  return {
    bourbonId: 'b1',
    bourbonName: 'Eagle Rare',
    distillery: 'Buffalo Trace',
    category: 'bourbon',
    subType: null,
    externalTastingNotes: null,
    reviewLinks: [],
    priority: 'high',
    status: 'actively_looking',
    ...over,
  } as WishlistEntry;
}

function bottle(over: Partial<Bourbon> = {}): Bourbon {
  return {
    name: 'Eagle Rare',
    nameLowercase: 'eagle rare',
    isNas: false,
    ...over,
  } as Bourbon;
}

function entry(over: Partial<LogEntry> = {}): LogEntry {
  return {
    bourbonId: 'b1',
    bourbonName: 'Eagle Rare',
    category: 'bourbon',
    isNas: false,
    entryType: 'drink',
    didNotPurchase: true,
    noseTags: [],
    palateTags: [],
    finishTags: [],
    ...over,
  } as LogEntry;
}

describe('foundItPrefill', () => {
  it('fills identity + purchase defaults from the wishlist entry alone', () => {
    const { patch, priorTags } = foundItPrefill(
      wish({ externalTastingNotes: 'r/bourbon loves it' }),
      null,
      [],
      TODAY
    );
    expect(patch).toMatchObject({
      bourbonName: 'Eagle Rare',
      bourbonId: 'b1',
      distillery: 'Buffalo Trace',
      category: 'bourbon',
      entryType: 'bottle_purchased',
      purchaseDate: TODAY,
      bottleRemainingPct: 100,
      personalNotes: 'r/bourbon loves it',
      proof: null,
      rating: null,
    });
    expect(priorTags).toBeNull();
  });

  it('fills spec fields from the catalog doc', () => {
    const { patch } = foundItPrefill(
      wish({ category: null, subType: null }),
      bottle({
        proof: 90,
        ageStatement: 10,
        bottler: 'BT',
        series: 'Antique',
        category: 'bourbon',
        subType: 'single_barrel',
      }),
      [],
      TODAY
    );
    expect(patch).toMatchObject({
      proof: 90,
      ageStatement: 10,
      isNas: false,
      bottler: 'BT',
      series: 'Antique',
      category: 'bourbon',
      subType: 'single_barrel',
    });
  });

  it('honors a NAS catalog bottle', () => {
    const { patch } = foundItPrefill(wish(), bottle({ isNas: true }), [], TODAY);
    expect(patch.isNas).toBe(true);
    expect(patch.ageStatement).toBeNull();
  });

  it('coalesces mash bill and spec gaps from prior entries, newest first', () => {
    const priors = [
      entry({ mashBillCorn: 75, proof: 101 }),
      entry({ mashBillCorn: 74, mashBillRye: 10, mashBillWheat: 5, mashBillMalt: 11 }),
    ];
    const { patch } = foundItPrefill(wish(), null, priors, TODAY);
    expect(patch).toMatchObject({
      mashBillCorn: 75, // newest wins
      mashBillRye: 10,
      mashBillWheat: 5,
      mashBillMalt: 11,
      proof: 101, // catalog absent → prior entry fills the gap
    });
  });

  it('takes the last (most recent) rating when several entries exist', () => {
    const priors = [
      entry({ rating: null }),
      entry({ rating: 4.5 }),
      entry({ rating: 3 }),
    ];
    const { patch } = foundItPrefill(wish(), null, priors, TODAY);
    expect(patch.rating).toBe(4.5);
  });

  it('carries tasting tags/notes from the newest entry that has any, as suggestions', () => {
    const priors = [
      entry({}), // no tasting content
      entry({
        noseTags: ['caramel'],
        palateTags: ['cherry', 'oak'],
        finishTags: [],
        palateNotes: 'big cherry note',
        finishLength: 'long',
      }),
    ];
    const { patch, priorTags } = foundItPrefill(wish(), null, priors, TODAY);
    expect(patch).toMatchObject({
      noseTags: ['caramel'],
      palateTags: ['cherry', 'oak'],
      palateNotes: 'big cherry note',
      finishLength: 'long',
    });
    expect(priorTags).toEqual({
      nose: ['caramel'],
      palate: ['cherry', 'oak'],
      finish: [],
    });
  });

  it('ignores prior entries for other bottles', () => {
    const priors = [entry({ bourbonId: 'other', rating: 5, mashBillCorn: 99 })];
    const { patch } = foundItPrefill(wish(), null, priors, TODAY);
    expect(patch.rating).toBeNull();
    expect(patch.mashBillCorn).toBeNull();
  });

  it('a found age statement always wins over NAS', () => {
    const { patch } = foundItPrefill(
      wish(),
      null,
      [entry({ ageStatement: 12, isNas: false })],
      TODAY
    );
    expect(patch.ageStatement).toBe(12);
    expect(patch.isNas).toBe(false);
  });
});
