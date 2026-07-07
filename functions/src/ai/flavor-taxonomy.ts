/**
 * Canonical flavor vocabulary + matcher for AI flavor enrichment (BB-185).
 *
 * The LLM is prompted with this exact list and told to use these labels, but it
 * can still return a near-miss ("dark cherry", "baking spice", "vanilla bean").
 * `matchCanonicalTag` maps such free text onto the nearest canonical label and
 * DROPS anything without a confident match — so no verbatim third-party prose is
 * ever stored, only controlled tags.
 *
 * ⚠️ Keep CANONICAL_FLAVOR_TAGS in sync with the frontend source of truth,
 * `src/app/shared/constants/flavor-tags.ts` (FLAVOR_TAG_GROUPS → ALL_FLAVOR_TAGS,
 * BB-181). This is a deliberate mirror: the two packages don't share a build.
 */

export const CANONICAL_FLAVOR_TAGS: string[] = [
  // Sweet
  "Vanilla", "Caramel", "Honey", "Butterscotch", "Brown Sugar", "Maple",
  "Toffee", "Chocolate", "Molasses", "Marshmallow", "Crème Brûlée", "Fudge",
  "Marzipan", "Cotton Candy", "Burnt Sugar",
  // Fruit
  "Cherry", "Apple", "Pear", "Berry", "Dried Fruit", "Banana", "Citrus",
  "Peach", "Apricot", "Fig", "Raisin", "Plum", "Pineapple", "Mango", "Grape",
  "Blackberry", "Cranberry", "Orange", "Lemon",
  // Spice
  "Rye Spice", "Cinnamon", "Nutmeg", "Black Pepper", "Clove", "Ginger",
  "Allspice", "Cardamom", "Anise", "White Pepper", "Mace", "Coriander",
  "Licorice",
  // Oak / Wood
  "Oak", "Toasted Oak", "Char", "Cedar", "Sandalwood", "Pine", "Sawdust",
  "Pencil Shavings", "Polished Wood",
  // Grain / Cereal
  "Corn", "Wheat", "Malt", "Bread", "Biscuit", "Rye Bread", "Oatmeal",
  "Cereal", "Graham Cracker", "Cornbread", "Dough",
  // Floral
  "Floral", "Rose", "Honeysuckle", "Lavender", "Violet", "Elderflower",
  "Potpourri", "Perfume",
  // Nutty
  "Nutty", "Almond", "Walnut", "Pecan", "Hazelnut", "Peanut", "Roasted Nuts",
  // Herbal / Vegetal
  "Mint", "Herbal", "Grassy", "Eucalyptus", "Dill", "Tea", "Hay", "Fennel",
  "Menthol",
  // Smoke / Peat
  "Smoke", "Peat", "Campfire", "Ash", "BBQ", "Tar", "Creosote", "Bonfire",
  // Dairy / Creamy
  "Creamy", "Butter", "Custard", "Buttercream", "Cheesecake", "Milk",
  // Roasted
  "Coffee", "Dark Chocolate", "Espresso", "Cocoa", "Mocha", "Caramelized",
  // Earthy / Mineral
  "Earthy", "Leather", "Tobacco", "Mushroom", "Flint", "Wet Stone", "Graphite",
  "Saline", "Brine", "Petrichor",
  // Funk / Off
  "Sulfur", "Rubber", "Nail Polish", "Cardboard", "Musty", "Metallic",
];

const CANONICAL_SET = new Set(CANONICAL_FLAVOR_TAGS);

/** Lowercase, fold diacritics, and reduce to single-spaced alphanumerics. */
export function normalizeTag(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Precomputed normalized index: normalized → canonical.
const NORMALIZED_TO_CANONICAL = new Map(
  CANONICAL_FLAVOR_TAGS.map((t) => [normalizeTag(t), t] as const)
);

/** Dice coefficient over character bigrams — robust to short variants/typos. */
function diceCoefficient(a: string, b: string): number {
  const bigrams = (s: string): string[] => {
    const out: string[] = [];
    for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
    return out;
  };
  const aB = bigrams(a);
  const bB = bigrams(b);
  if (!aB.length || !bB.length) return a === b ? 1 : 0;
  const counts = new Map<string, number>();
  for (const g of aB) counts.set(g, (counts.get(g) ?? 0) + 1);
  let hits = 0;
  for (const g of bB) {
    const c = counts.get(g);
    if (c) {
      hits++;
      counts.set(g, c - 1);
    }
  }
  return (2 * hits) / (aB.length + bB.length);
}

/** Whether `phrase` tokens appear as a contiguous run within `tokens`. */
function containsPhrase(tokens: string[], phrase: string[]): boolean {
  if (!phrase.length || phrase.length > tokens.length) return false;
  for (let i = 0; i + phrase.length <= tokens.length; i++) {
    let ok = true;
    for (let j = 0; j < phrase.length; j++) {
      if (tokens[i + j] !== phrase[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

// Minimum Dice similarity to accept a fuzzy match — conservative, so a weak
// guess is dropped rather than mislabeled.
const SIMILARITY_THRESHOLD = 0.6;

/**
 * Map free text to the nearest canonical flavor tag, or `null` if no confident
 * match. Order: exact → canonical-phrase-contained-in-input → best Dice ≥ 0.6.
 */
export function matchCanonicalTag(
  input: string,
  tags: string[] = CANONICAL_FLAVOR_TAGS
): string | null {
  const norm = normalizeTag(input);
  if (!norm) return null;

  // Exact (normalized) match.
  const exact = NORMALIZED_TO_CANONICAL.get(norm);
  if (exact && (tags === CANONICAL_FLAVOR_TAGS || tags.includes(exact))) {
    return exact;
  }

  const inputTokens = norm.split(" ");
  let bestPhrase: string | null = null;
  let bestPhraseLen = 0;
  let bestDice: string | null = null;
  let bestDiceScore = SIMILARITY_THRESHOLD;

  for (const tag of tags) {
    const nt = normalizeTag(tag);
    if (nt === norm) return tag;
    // Prefer the longest canonical phrase fully contained in the input,
    // e.g. "cracked black pepper" → "Black Pepper".
    const tagTokens = nt.split(" ");
    if (containsPhrase(inputTokens, tagTokens) && tagTokens.length > bestPhraseLen) {
      bestPhrase = tag;
      bestPhraseLen = tagTokens.length;
    }
    // Track best whole-string similarity as a fallback.
    const score = diceCoefficient(norm.replace(/ /g, ""), nt.replace(/ /g, ""));
    if (score > bestDiceScore) {
      bestDiceScore = score;
      bestDice = tag;
    }
  }

  return bestPhrase ?? bestDice;
}

/** Match a list, dropping misses and duplicates while preserving order. */
export function matchCanonicalTags(
  inputs: string[],
  tags: string[] = CANONICAL_FLAVOR_TAGS
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of inputs) {
    const match = matchCanonicalTag(raw, tags);
    if (match && !seen.has(match)) {
      seen.add(match);
      out.push(match);
    }
  }
  return out;
}

/** Whether a label is already an exact canonical tag. */
export function isCanonicalTag(tag: string): boolean {
  return CANONICAL_SET.has(tag);
}
