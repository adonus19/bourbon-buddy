import {
  CANONICAL_FLAVOR_TAGS,
  isCanonicalTag,
  matchCanonicalTag,
  matchCanonicalTags,
  normalizeTag,
} from "./flavor-taxonomy";

describe("normalizeTag", () => {
  it("lowercases, folds diacritics, and collapses punctuation", () => {
    expect(normalizeTag("Crème Brûlée")).toBe("creme brulee");
    expect(normalizeTag("  Black-Pepper! ")).toBe("black pepper");
  });
});

describe("CANONICAL_FLAVOR_TAGS", () => {
  it("has no duplicate labels", () => {
    expect(new Set(CANONICAL_FLAVOR_TAGS).size).toBe(CANONICAL_FLAVOR_TAGS.length);
  });
});

describe("matchCanonicalTag", () => {
  it("returns the canonical label for an exact (case-insensitive) match", () => {
    expect(matchCanonicalTag("Vanilla")).toBe("Vanilla");
    expect(matchCanonicalTag("vanilla")).toBe("Vanilla");
    expect(matchCanonicalTag("OAK")).toBe("Oak");
  });

  it("matches through diacritics", () => {
    expect(matchCanonicalTag("creme brulee")).toBe("Crème Brûlée");
  });

  it("maps a descriptive phrase to the canonical tag it contains", () => {
    expect(matchCanonicalTag("dark cherry")).toBe("Cherry");
    expect(matchCanonicalTag("cracked black pepper")).toBe("Black Pepper");
    expect(matchCanonicalTag("a hint of cinnamon")).toBe("Cinnamon");
    expect(matchCanonicalTag("vanilla bean")).toBe("Vanilla");
  });

  it("fuzzy-matches close variants and typos", () => {
    expect(matchCanonicalTag("vanila")).toBe("Vanilla");
    expect(matchCanonicalTag("smoky")).toBe("Smoke");
  });

  it("drops anything without a confident match", () => {
    expect(matchCanonicalTag("gasoline")).toBeNull();
    expect(matchCanonicalTag("unicorn tears")).toBeNull();
    expect(matchCanonicalTag("")).toBeNull();
  });

  it("respects a restricted tag subset", () => {
    expect(matchCanonicalTag("vanilla", ["Oak", "Char"])).toBeNull();
    expect(matchCanonicalTag("oak", ["Oak", "Char"])).toBe("Oak");
  });
});

describe("matchCanonicalTags", () => {
  it("maps a list, dropping misses and duplicates while keeping order", () => {
    expect(
      matchCanonicalTags(["Vanilla", "vanilla bean", "dark cherry", "cherry", "xyzzy"])
    ).toEqual(["Vanilla", "Cherry"]);
  });
});

describe("isCanonicalTag", () => {
  it("recognizes exact canonical labels only", () => {
    expect(isCanonicalTag("Black Pepper")).toBe(true);
    expect(isCanonicalTag("black pepper")).toBe(false);
    expect(isCanonicalTag("Gasoline")).toBe(false);
  });
});
