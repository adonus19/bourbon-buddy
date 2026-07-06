import { ALL_FLAVOR_TAGS, FLAVOR_TAG_GROUPS } from './flavor-tags';

describe('FLAVOR_TAG_GROUPS (BB-181 flavor wheel)', () => {
  it('has no duplicate labels across the whole wheel', () => {
    // Uniqueness matters: the AI matcher (BB-185) maps onto these canonical tags.
    expect(new Set(ALL_FLAVOR_TAGS).size).toBe(ALL_FLAVOR_TAGS.length);
  });

  it('ALL_FLAVOR_TAGS covers every group’s common + extended tiers', () => {
    const expected = FLAVOR_TAG_GROUPS.reduce(
      (n, g) => n + g.common.length + g.extended.length,
      0
    );
    expect(ALL_FLAVOR_TAGS.length).toBe(expected);
  });

  it('preserves the original seed tags (no data loss for existing entries)', () => {
    const originals = [
      'Vanilla',
      'Caramel',
      'Honey',
      'Cherry',
      'Apple',
      'Rye Spice',
      'Oak',
      'Corn',
      'Wheat',
      'Leather',
      'Coffee',
      'Smoke',
    ];
    for (const tag of originals) {
      expect(ALL_FLAVOR_TAGS).toContain(tag);
    }
  });

  it('every group has a category name and at least one tag', () => {
    for (const g of FLAVOR_TAG_GROUPS) {
      expect(g.category.length).toBeGreaterThan(0);
      expect(g.common.length + g.extended.length).toBeGreaterThan(0);
    }
  });
});
