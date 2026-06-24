// Flavor tag reference library, grouped by category.
// Used by the tasting-note chip selectors (Nose / Palate / Finish).
// Source: docs/bourbon-buddy-feature-spec.md (section 2a). Stored as a
// hardcoded TS constant for MVP — simplest, no extra Firestore read.

export interface FlavorTagGroup {
  category: string;
  tags: string[];
}

export const FLAVOR_TAG_GROUPS: FlavorTagGroup[] = [
  {
    category: 'Sweet',
    tags: [
      'Vanilla',
      'Caramel',
      'Honey',
      'Butterscotch',
      'Brown Sugar',
      'Maple',
      'Chocolate',
      'Toffee',
    ],
  },
  {
    category: 'Fruit',
    tags: ['Cherry', 'Apple', 'Pear', 'Citrus', 'Dried Fruit', 'Banana', 'Berry'],
  },
  {
    category: 'Spice',
    tags: ['Rye Spice', 'Cinnamon', 'Nutmeg', 'Black Pepper', 'Clove', 'Ginger'],
  },
  {
    category: 'Oak / Wood',
    tags: ['Oak', 'Toasted Oak', 'Char', 'Cedar'],
  },
  {
    category: 'Grain',
    tags: ['Corn', 'Wheat', 'Malt', 'Biscuit', 'Bread'],
  },
  {
    category: 'Other',
    tags: [
      'Leather',
      'Tobacco',
      'Floral',
      'Mint',
      'Earthy',
      'Nutty',
      'Coffee',
      'Smoke',
    ],
  },
];

// Flat list of every tag, useful for validation / search.
export const ALL_FLAVOR_TAGS: string[] = FLAVOR_TAG_GROUPS.flatMap(
  (group) => group.tags
);
