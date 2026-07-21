import {
  EXTRACTION_RESPONSE_SCHEMA,
  isProductName,
  numberAppearsInText,
  parseArticleType,
  parseExtractionResponse,
} from "./extraction";

/** Wraps bottle objects in the JSON envelope the model returns. */
const envelope = (bottles: unknown[], articleType?: string): string =>
  JSON.stringify(articleType ? { articleType, bottles } : { bottles });

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
        proof: null,
        ageYears: null,
        msrp: null,
        releaseType: null,
        verdict: null,
        rating: null,
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
        proof: null,
        ageYears: null,
        msrp: null,
        releaseType: null,
        verdict: null,
        rating: null,
      },
    ]);
  });

  it("returns [] when the bottles array is missing", () => {
    expect(parseExtractionResponse("{}")).toEqual([]);
  });

  it("throws on malformed JSON so the article stays retryable", () => {
    expect(() => parseExtractionResponse("not json")).toThrow();
  });

  it("salvages complete bottles from a truncated (token-capped) reply", () => {
    // A multi-bottle listicle whose JSON was cut off mid-object (BB-227): the
    // complete bottles are recovered; the partial trailing one is dropped —
    // instead of the whole article yielding zero.
    const truncated =
      '{"articleType":"listicle","bottles":[' +
      '{"name":"Weller 12 Year","spirit":"whiskey","category":"bourbon"},' +
      '{"name":"Blanton\'s Single Barrel","spirit":"whiskey","category":"bourbon"},' +
      '{"name":"E.H. Taylor Small Ba';
    const out = parseExtractionResponse(truncated);
    expect(out.map((b) => b.name)).toEqual([
      "Weller 12 Year",
      "Blanton's Single Barrel",
    ]);
  });

  // BB-233: truncation must never yield a bottle with nose+palate but no finish.
  // finish is the LAST key in the flavor object, so a token-capped reply cuts it
  // first — the repair must DROP the incomplete bottle, not emit a 2-stage one.
  it("never emits a 2-stage bottle when a reply truncates mid-finish", () => {
    const truncated =
      '{"articleType":"independent_review","bottles":[' +
      // A complete bottle keeps all three stages...
      '{"name":"Maker\'s Mark","spirit":"whiskey","category":"bourbon",' +
      '"flavor":{"nose":["lemon","vanilla"],"palate":["caramel"],"finish":["oak"]}},' +
      // ...the trailing bottle is cut off partway through its finish array.
      '{"name":"Weller 12 Year","spirit":"whiskey","category":"bourbon",' +
      '"flavor":{"nose":["honey"],"palate":["cherry"],"finish":["cinna';
    const out = parseExtractionResponse(truncated);
    // Only the complete bottle survives — the half-finished one is dropped whole.
    expect(out.map((b) => b.name)).toEqual(["Maker's Mark"]);
    expect(out[0].flavor).toEqual({
      nose: ["lemon", "vanilla"],
      palate: ["caramel"],
      finish: ["oak"],
    });
    // No survivor may ever carry a finish-less flavor object.
    for (const b of out) {
      const flavor = b.flavor as { finish?: unknown } | null;
      if (flavor && "nose" in (flavor as object)) {
        expect(flavor).toHaveProperty("finish");
      }
    }
  });
});

describe("EXTRACTION_RESPONSE_SCHEMA flavor object (BB-233)", () => {
  const flavor = (
    (EXTRACTION_RESPONSE_SCHEMA.properties as Record<string, unknown>)
      .bottles as { items?: { properties?: Record<string, unknown> } }
  ).items?.properties?.flavor as {
    required?: string[];
    propertyOrdering?: string[];
    properties?: Record<string, unknown>;
  };

  it("declares all three stages", () => {
    expect(Object.keys(flavor.properties ?? {})).toEqual([
      "nose",
      "palate",
      "finish",
    ]);
  });

  // The root cause: without `required`, Gemini's controlled decoding drops the
  // optional trailing `finish` field, so review-sourced profiles arrived with
  // only nose + palate. Requiring all three forces the key to be emitted.
  it("requires nose, palate, AND finish so finish is never dropped", () => {
    expect(flavor.required).toEqual(["nose", "palate", "finish"]);
  });

  // propertyOrdering pins generation to nose → palate → finish (Gemini defaults
  // to alphabetical otherwise, which reorders and degrades results).
  it("pins stage generation order", () => {
    expect(flavor.propertyOrdering).toEqual(["nose", "palate", "finish"]);
  });
});

describe("numberAppearsInText (verbatim fact guard, BB-219)", () => {
  it("finds a bare integer with digit boundaries", () => {
    expect(numberAppearsInText(90, "bottled at 90 proof")).toBe(true);
    expect(numberAppearsInText(90, "released in 1905")).toBe(false);
    expect(numberAppearsInText(90, "at 190 proof")).toBe(false);
    expect(numberAppearsInText(12, "Weller 12 Year")).toBe(true);
  });

  it("finds a decimal exactly, not its integer prefix", () => {
    expect(numberAppearsInText(93.7, "comes in at 93.7 proof")).toBe(true);
    expect(numberAppearsInText(93, "comes in at 93.7 proof")).toBe(false);
    expect(numberAppearsInText(93.7, "comes in at 93 proof")).toBe(false);
  });

  it("matches thousands with or without a comma", () => {
    expect(numberAppearsInText(1299, "priced at $1,299 per bottle")).toBe(true);
    expect(numberAppearsInText(1299, "priced at $1299 per bottle")).toBe(true);
  });

  it("requires a leading $ when asked (msrp guard)", () => {
    expect(numberAppearsInText(60, "an MSRP of $60", true)).toBe(true);
    expect(numberAppearsInText(60, "aged 60 months", true)).toBe(false);
    expect(numberAppearsInText(59.99, "for $59.99 this fall", true)).toBe(true);
  });
});

describe("parseExtractionResponse — fact fields (BB-219)", () => {
  const bottle = (facts: Record<string, unknown>) => ({
    name: "Old Fitzgerald Bottled-in-Bond",
    spirit: "whiskey",
    category: "bourbon",
    ...facts,
  });

  it("keeps facts whose numbers appear verbatim in the article text", () => {
    const text =
      "Old Fitzgerald Bottled-in-Bond returns this spring: 100 proof, aged 11 " +
      "years, with a suggested price of $110.";
    const out = parseExtractionResponse(
      envelope([bottle({ proof: 100, ageYears: 11, msrp: 110 })]),
      text
    );
    expect(out[0].proof).toBe(100);
    expect(out[0].ageYears).toBe(11);
    expect(out[0].msrp).toBe(110);
  });

  it("nulls facts the article text never states (invented numbers)", () => {
    const out = parseExtractionResponse(
      envelope([bottle({ proof: 100, ageYears: 11, msrp: 110 })]),
      "Old Fitzgerald Bottled-in-Bond returns this spring."
    );
    expect(out[0].proof).toBeNull();
    expect(out[0].ageYears).toBeNull();
    expect(out[0].msrp).toBeNull();
  });

  it("nulls an msrp whose number appears without a dollar sign", () => {
    const out = parseExtractionResponse(
      envelope([bottle({ msrp: 110 })]),
      "a batch of 110 barrels was selected"
    );
    expect(out[0].msrp).toBeNull();
  });

  it("nulls out-of-range facts even when the number is in the text", () => {
    const out = parseExtractionResponse(
      envelope([bottle({ proof: 40, ageYears: 200, msrp: 5 })]),
      "just 40 stores got it; the distillery is 200 years old; a $5 raffle"
    );
    expect(out[0].proof).toBeNull(); // below 60-proof floor
    expect(out[0].ageYears).toBeNull(); // above 50-year ceiling
    expect(out[0].msrp).toBeNull(); // below $10 floor
  });

  it("nulls non-numeric fact values from a malformed reply", () => {
    const out = parseExtractionResponse(
      envelope([bottle({ proof: "100 proof", ageYears: [11], msrp: "$110" })]),
      "100 proof, aged 11 years, $110"
    );
    expect(out[0].proof).toBeNull();
    expect(out[0].ageYears).toBeNull();
    expect(out[0].msrp).toBeNull();
  });

  it("keeps a valid releaseType and nulls anything off-enum", () => {
    const out = parseExtractionResponse(
      envelope([
        bottle({ releaseType: "limited" }),
        { ...bottle({ releaseType: "collectible" }), name: "Weller 12 Year" },
      ]),
      ""
    );
    expect(out[0].releaseType).toBe("limited");
    expect(out[1].releaseType).toBeNull();
  });

  it("defaults every fact to null when the model omits them (old-style reply)", () => {
    const out = parseExtractionResponse(envelope([bottle({})]));
    expect(out[0]).toMatchObject({
      proof: null,
      ageYears: null,
      msrp: null,
      releaseType: null,
    });
  });
});

describe("parseArticleType (source classification, BB-220)", () => {
  it("returns each valid type as-is", () => {
    for (const t of ["press_release", "independent_review", "listicle", "news"]) {
      expect(parseArticleType(envelope([], t))).toBe(t);
    }
  });

  it("defaults a missing or invalid type to news", () => {
    expect(parseArticleType(envelope([]))).toBe("news");
    expect(parseArticleType(envelope([], "advertorial"))).toBe("news");
    expect(parseArticleType(JSON.stringify({ articleType: 7, bottles: [] }))).toBe(
      "news"
    );
  });

  it("throws on malformed JSON so the article stays retryable", () => {
    expect(() => parseArticleType("not json")).toThrow();
  });

  it("still reads articleType from a truncated reply (BB-227)", () => {
    const truncated =
      '{"articleType":"listicle","bottles":[{"name":"Weller 12","spirit":"whiskey"},{"name":"Blan';
    expect(parseArticleType(truncated)).toBe("listicle");
  });
});

describe("parseExtractionResponse — verdict gating (BB-220)", () => {
  const reviewed = (verdict: unknown) => ({
    name: "Russell's Reserve 13",
    spirit: "whiskey",
    category: "bourbon",
    verdict,
  });

  it("keeps a verdict from an independent review or listicle", () => {
    const fromReview = parseExtractionResponse(
      envelope([reviewed("rave")], "independent_review")
    );
    expect(fromReview[0].verdict).toBe("rave");
    const fromListicle = parseExtractionResponse(
      envelope([reviewed("mixed")], "listicle")
    );
    expect(fromListicle[0].verdict).toBe("mixed");
  });

  it("drops a verdict from a press release or plain news", () => {
    // Marketing copy has no critical opinion — a verdict extracted from it is
    // noise by definition, enforced here rather than trusted to the prompt.
    const fromPr = parseExtractionResponse(
      envelope([reviewed("rave")], "press_release")
    );
    expect(fromPr[0].verdict).toBeNull();
    const fromNews = parseExtractionResponse(envelope([reviewed("positive")]));
    expect(fromNews[0].verdict).toBeNull();
  });

  it("nulls an off-enum verdict even from a review", () => {
    const out = parseExtractionResponse(
      envelope([reviewed("meh"), reviewed(5)], "independent_review")
    );
    expect(out[0].verdict).toBeNull();
    expect(out[1].verdict).toBeNull();
  });
});

describe("parseExtractionResponse — raw rating gating (BB-221)", () => {
  const rated = (rating: unknown) => ({
    name: "Russell's Reserve 13",
    spirit: "whiskey",
    category: "bourbon",
    rating,
  });

  it("keeps the raw rating string from a review or listicle, unparsed", () => {
    // parseExtractionResponse only carries the printed string through; the
    // verbatim check + scale normalization happen later in parseRating.
    const fromReview = parseExtractionResponse(
      envelope([rated("92/100")], "independent_review")
    );
    expect(fromReview[0].rating).toBe("92/100");
    const fromListicle = parseExtractionResponse(
      envelope([rated("4.5 stars")], "listicle")
    );
    expect(fromListicle[0].rating).toBe("4.5 stars");
  });

  it("drops a rating from a press release or plain news", () => {
    const fromPr = parseExtractionResponse(
      envelope([rated("92/100")], "press_release")
    );
    expect(fromPr[0].rating).toBeNull();
    const fromNews = parseExtractionResponse(envelope([rated("92/100")]));
    expect(fromNews[0].rating).toBeNull();
  });

  it("nulls a non-string rating (model must send a raw string, never a number)", () => {
    const out = parseExtractionResponse(
      envelope([rated(92), rated(null)], "independent_review")
    );
    expect(out[0].rating).toBeNull();
    expect(out[1].rating).toBeNull();
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
