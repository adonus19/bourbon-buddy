import { WishlistEntry } from '../../models';
import {
  EMPTY_WISHLIST_FILTER,
  WishlistFilter,
  isWishlistFilterActive,
  matchesWishlistFilter,
  wishlistChips,
} from './wishlist-filter';

function entry(over: Partial<WishlistEntry> = {}): WishlistEntry {
  return {
    priority: 'high',
    category: 'bourbon',
    msrp: 60,
    ...over,
  } as WishlistEntry;
}

const filter = (over: Partial<WishlistFilter>): WishlistFilter => ({
  ...EMPTY_WISHLIST_FILTER,
  ...over,
});

describe('isWishlistFilterActive', () => {
  it('is false when empty, true when any criterion set', () => {
    expect(isWishlistFilterActive(EMPTY_WISHLIST_FILTER)).toBe(false);
    expect(isWishlistFilterActive(filter({ priorities: ['grail'] }))).toBe(true);
    expect(isWishlistFilterActive(filter({ priceMin: 10 }))).toBe(true);
  });
});

describe('matchesWishlistFilter', () => {
  it('passes the empty filter', () => {
    expect(matchesWishlistFilter(entry(), EMPTY_WISHLIST_FILTER)).toBe(true);
  });

  it('filters by priority and category', () => {
    expect(matchesWishlistFilter(entry(), filter({ priorities: ['grail'] }))).toBe(
      false
    );
    expect(matchesWishlistFilter(entry(), filter({ categories: ['rye'] }))).toBe(
      false
    );
    expect(
      matchesWishlistFilter(entry({ category: null }), filter({ categories: ['rye'] }))
    ).toBe(false);
  });

  it('applies MSRP price bounds (missing MSRP excluded)', () => {
    expect(matchesWishlistFilter(entry({ msrp: 40 }), filter({ priceMin: 50 }))).toBe(
      false
    );
    expect(matchesWishlistFilter(entry({ msrp: 90 }), filter({ priceMax: 80 }))).toBe(
      false
    );
    expect(matchesWishlistFilter(entry({ msrp: null }), filter({ priceMin: 50 }))).toBe(
      false
    );
    expect(matchesWishlistFilter(entry({ msrp: 60 }), filter({ priceMin: 50, priceMax: 80 }))).toBe(
      true
    );
  });
});

describe('wishlistChips', () => {
  it('creates a chip per active criterion with a price range label', () => {
    const chips = wishlistChips(
      filter({ priorities: ['high'], categories: ['bourbon'], priceMin: 20 })
    );
    expect(chips).toHaveLength(3);
    expect(chips.some((c) => c.label.includes('MSRP $20–∞'))).toBe(true);
  });

  it('returns no chips when empty', () => {
    expect(wishlistChips(EMPTY_WISHLIST_FILTER)).toEqual([]);
  });
});
