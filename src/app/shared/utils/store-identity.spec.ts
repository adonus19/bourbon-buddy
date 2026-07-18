import { StoreIdentity, matchStore, storeIdentityKey } from './store-identity';

const id = (over: Partial<StoreIdentity> = {}): StoreIdentity => ({
  placeId: null,
  nameNormalized: 'total wine',
  city: 'Louisville',
  ...over,
});

describe('storeIdentityKey (BB-223)', () => {
  it('keys by placeId when present, ignoring name/city', () => {
    expect(storeIdentityKey(id({ placeId: 'osm:123' }))).toBe(
      storeIdentityKey(id({ placeId: 'osm:123', nameNormalized: 'other', city: 'X' }))
    );
  });

  it('keys by nameNormalized + city (case-insensitive) without a placeId', () => {
    expect(storeIdentityKey(id({ city: 'Louisville' }))).toBe(
      storeIdentityKey(id({ city: 'louisville' }))
    );
  });

  it('treats different cities as different locations (per-location, not per-chain)', () => {
    expect(storeIdentityKey(id({ city: 'Louisville' }))).not.toBe(
      storeIdentityKey(id({ city: 'Lexington' }))
    );
  });
});

describe('matchStore (BB-223)', () => {
  const stores = [
    { id: 's1', placeId: 'osm:1', nameNormalized: 'total wine', city: 'Louisville' },
    { id: 's2', placeId: null, nameNormalized: 'liquor barn', city: 'Lexington' },
  ];

  it('finds a store by placeId', () => {
    expect(matchStore(stores, id({ placeId: 'osm:1', nameNormalized: 'x', city: 'y' }))?.id).toBe('s1');
  });

  it('finds a store by nameNormalized + city when no placeId', () => {
    expect(
      matchStore(stores, id({ placeId: null, nameNormalized: 'liquor barn', city: 'Lexington' }))?.id
    ).toBe('s2');
  });

  it('returns undefined when the location differs', () => {
    expect(
      matchStore(stores, id({ placeId: null, nameNormalized: 'liquor barn', city: 'Louisville' }))
    ).toBeUndefined();
  });
});
