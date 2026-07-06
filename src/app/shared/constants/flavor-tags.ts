// Flavor tag reference library — a curated whiskey flavor wheel (BB-181).
// Used by the tasting-note chip selectors (Nose / Palate / Finish) and, going
// forward, as the CANONICAL vocabulary the AI enrichment maps onto (BB-185) and
// auto-populate consumes (BB-186). Kept as a hardcoded TS constant (no extra
// Firestore read); every label is unique across the whole wheel.
//
// Each category is split into two tiers:
//   common   — the everyday notes, shown by default
//   extended — the long tail, revealed by the selector's "Show more" toggle

export interface FlavorTagGroup {
  category: string;
  common: string[];
  extended: string[];
}

export const FLAVOR_TAG_GROUPS: FlavorTagGroup[] = [
  {
    category: 'Sweet',
    common: [
      'Vanilla',
      'Caramel',
      'Honey',
      'Butterscotch',
      'Brown Sugar',
      'Maple',
      'Toffee',
      'Chocolate',
    ],
    extended: [
      'Molasses',
      'Marshmallow',
      'Crème Brûlée',
      'Fudge',
      'Marzipan',
      'Cotton Candy',
      'Burnt Sugar',
    ],
  },
  {
    category: 'Fruit',
    common: [
      'Cherry',
      'Apple',
      'Pear',
      'Berry',
      'Dried Fruit',
      'Banana',
      'Citrus',
    ],
    extended: [
      'Peach',
      'Apricot',
      'Fig',
      'Raisin',
      'Plum',
      'Pineapple',
      'Mango',
      'Grape',
      'Blackberry',
      'Cranberry',
      'Orange',
      'Lemon',
    ],
  },
  {
    category: 'Spice',
    common: ['Rye Spice', 'Cinnamon', 'Nutmeg', 'Black Pepper', 'Clove', 'Ginger'],
    extended: [
      'Allspice',
      'Cardamom',
      'Anise',
      'White Pepper',
      'Mace',
      'Coriander',
      'Licorice',
    ],
  },
  {
    category: 'Oak / Wood',
    common: ['Oak', 'Toasted Oak', 'Char', 'Cedar'],
    extended: ['Sandalwood', 'Pine', 'Sawdust', 'Pencil Shavings', 'Polished Wood'],
  },
  {
    category: 'Grain / Cereal',
    common: ['Corn', 'Wheat', 'Malt', 'Bread', 'Biscuit'],
    extended: ['Rye Bread', 'Oatmeal', 'Cereal', 'Graham Cracker', 'Cornbread', 'Dough'],
  },
  {
    category: 'Floral',
    common: ['Floral', 'Rose'],
    extended: ['Honeysuckle', 'Lavender', 'Violet', 'Elderflower', 'Potpourri', 'Perfume'],
  },
  {
    category: 'Nutty',
    common: ['Nutty', 'Almond', 'Walnut'],
    extended: ['Pecan', 'Hazelnut', 'Peanut', 'Roasted Nuts'],
  },
  {
    category: 'Herbal / Vegetal',
    common: ['Mint', 'Herbal'],
    extended: ['Grassy', 'Eucalyptus', 'Dill', 'Tea', 'Hay', 'Fennel', 'Menthol'],
  },
  {
    category: 'Smoke / Peat',
    common: ['Smoke'],
    extended: ['Peat', 'Campfire', 'Ash', 'BBQ', 'Tar', 'Creosote', 'Bonfire'],
  },
  {
    category: 'Dairy / Creamy',
    common: ['Creamy', 'Butter'],
    extended: ['Custard', 'Buttercream', 'Cheesecake', 'Milk'],
  },
  {
    category: 'Roasted',
    common: ['Coffee', 'Dark Chocolate'],
    extended: ['Espresso', 'Cocoa', 'Mocha', 'Caramelized'],
  },
  {
    category: 'Earthy / Mineral',
    common: ['Earthy', 'Leather', 'Tobacco'],
    extended: ['Mushroom', 'Flint', 'Wet Stone', 'Graphite', 'Saline', 'Brine', 'Petrichor'],
  },
  {
    category: 'Funk / Off',
    common: [],
    extended: ['Sulfur', 'Rubber', 'Nail Polish', 'Cardboard', 'Musty', 'Metallic'],
  },
];

/** Every tag across both tiers — useful for validation / the AI matcher. */
export const ALL_FLAVOR_TAGS: string[] = FLAVOR_TAG_GROUPS.flatMap((g) => [
  ...g.common,
  ...g.extended,
]);
