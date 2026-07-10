import { isProductName, parseExtractionResponse } from "./extraction";

/** Wraps bottle objects in the JSON envelope the model returns. */
const envelope = (bottles: unknown[]): string => JSON.stringify({ bottles });

describe("parseExtractionResponse (whiskey-only filter, BB-195)", () => {
  it("keeps bottles the model marks as whiskey", () => {
    const out = parseExtractionResponse(
      envelope([
        {
          name: "Weller 12 Year",
          spirit: "whiskey",
          distillery: "Buffalo Trace",
          category: "bourbon",
        },
      ])
    );
    expect(out).toEqual([
      {
        name: "Weller 12 Year",
        distillery: "Buffalo Trace",
        category: "bourbon",
        flavor: null,
      },
    ]);
  });

  it("drops bottles the model marks as a non-whiskey spirit", () => {
    const out = parseExtractionResponse(
      envelope([
        { name: "Don Julio 1942", spirit: "other", category: null },
        { name: "Hendrick's Gin", spirit: "other", category: null },
        { name: "Sierra Nevada Pale Ale", spirit: "other", category: null },
        { name: "Michter's 10 Year", spirit: "whiskey", category: "bourbon" },
      ])
    );
    expect(out.map((b) => b.name)).toEqual(["Michter's 10 Year"]);
  });

  it("drops an unmarked bottle whose category is a foreign spirit", () => {
    // Older-style response with no spirit field: a category outside the
    // whiskey enum (e.g. the model volunteering "tequila") is a drop signal,
    // not something to null out and let through.
    const out = parseExtractionResponse(
      envelope([
        { name: "Casamigos Blanco", category: "tequila" },
        { name: "Weller 12 Year", category: "bourbon" },
      ])
    );
    expect(out.map((b) => b.name)).toEqual(["Weller 12 Year"]);
  });

  it("keeps an unmarked bottle with a null category (unsure whiskey)", () => {
    const out = parseExtractionResponse(
      envelope([{ name: "Mystery Single Barrel", category: null }])
    );
    expect(out.map((b) => b.name)).toEqual(["Mystery Single Barrel"]);
  });

  it("nulls an invalid category on a whiskey instead of dropping it", () => {
    const out = parseExtractionResponse(
      envelope([
        { name: "Stellum Black", spirit: "whiskey", category: "small batch" },
      ])
    );
    expect(out).toHaveLength(1);
    expect(out[0].category).toBeNull();
  });

  it("keeps every whiskey enum category", () => {
    const categories = [
      "bourbon",
      "rye",
      "wheat_whiskey",
      "tennessee",
      "american_other",
      "scotch",
      "irish",
      "japanese",
      "world_other",
    ];
    const out = parseExtractionResponse(
      envelope(
        // Needs a proper-noun name — `isProductName` rejects "Bottle 0" as
        // whiskey vocabulary, which is exactly its job.
        categories.map((category, i) => ({
          name: `Larceny ${i}`,
          spirit: "whiskey",
          category,
        }))
      )
    );
    expect(out.map((b) => b.category)).toEqual(categories);
  });

  it("drops nameless or non-object entries and preserves flavor cues", () => {
    const out = parseExtractionResponse(
      envelope([
        null,
        "not-an-object",
        { name: "   ", spirit: "whiskey" },
        {
          name: "Russell's Reserve 13",
          spirit: "whiskey",
          category: "bourbon",
          flavor: { nose: ["vanilla"], palate: ["cherry"], finish: ["oak"] },
        },
      ])
    );
    expect(out).toEqual([
      {
        name: "Russell's Reserve 13",
        distillery: null,
        category: "bourbon",
        flavor: { nose: ["vanilla"], palate: ["cherry"], finish: ["oak"] },
      },
    ]);
  });

  it("returns [] when the bottles array is missing", () => {
    expect(parseExtractionResponse("{}")).toEqual([]);
  });

  it("throws on malformed JSON so the article stays retryable", () => {
    expect(() => parseExtractionResponse("not json")).toThrow();
  });
});

describe("isProductName (descriptive-phrase filter, BB-201)", () => {
  const products = [
    "Weller 12 Year",
    "E.H. Taylor Small Batch",
    "Pursuit United",
    "Blanton's",
    "1792 Small Batch",
    "Old Fitzgerald Bottled-in-Bond",
    "Mystery Single Barrel",
    "Russell's Reserve 13",
  ];
  for (const name of products) {
    it(`keeps the branded product "${name}"`, () => {
      expect(isProductName(name)).toBe(true);
    });
  }

  // The real regression: an article that merely *describes* whiskey generically
  // ("sources award-winning bourbon and rye barrels ... to create small-batch
  // expressions") had every one of these lifted out as a bottle.
  const phrases = [
    "award-winning bourbon",
    "Award-Winning Bourbon",
    "award-winning rye",
    "small-batch expressions",
    "bourbon and rye barrels",
    "Bourbon And Rye Barrels",
    "sourced barrels",
    "straight bourbon whiskey",
    "single barrel",
    "limited edition release",
  ];
  for (const name of phrases) {
    it(`drops the descriptive phrase "${name}"`, () => {
      expect(isProductName(name)).toBe(false);
    });
  }

  const companies = [
    "Pursuit Spirits",
    "Buffalo Trace Distillery",
    "Heaven Hill Brands",
    "Bardstown Bourbon Company",
  ];
  for (const name of companies) {
    it(`drops the company/brand name "${name}"`, () => {
      expect(isProductName(name)).toBe(false);
    });
  }

  it("drops an empty or punctuation-only name", () => {
    expect(isProductName("")).toBe(false);
    expect(isProductName("  --  ")).toBe(false);
  });
});

describe("parseExtractionResponse + product-name filter", () => {
  it("drops descriptive phrases the model returned as bottles", () => {
    const out = parseExtractionResponse(
      envelope([
        { name: "award-winning bourbon", spirit: "whiskey", category: "bourbon" },
        { name: "award-winning rye", spirit: "whiskey", category: "rye" },
        { name: "Pursuit Spirits", spirit: "whiskey", category: null },
        { name: "Pursuit United", spirit: "whiskey", category: "bourbon" },
      ])
    );
    expect(out.map((b) => b.name)).toEqual(["Pursuit United"]);
  });
});
