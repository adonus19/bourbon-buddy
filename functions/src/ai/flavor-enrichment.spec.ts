import {
  applyArticleSeed,
  applyEnrichment,
  profileProvenance,
  articleFlavorSeed,
  buildFlavorPrompt,
  FLAVOR_PROMPT_VERSION,
  FlavorTags,
  generateFlavorTags,
  hasAnyTags,
  isAdequateProfile,
  mergeFlavorTags,
  needsPromptUpgrade,
  profileToTags,
  sameTags,
  sanitizeFlavorTags,
  shouldSweepEnrich,
} from "./flavor-enrichment";

describe("sanitizeFlavorTags (BB-185)", () => {
  it("maps model output to canonical tags, dropping misses and dupes", () => {
    const out = sanitizeFlavorTags({
      nose: ["vanilla", "Caramel", "xyzzy"],
      palate: ["dark cherry", "cherry"], // both map to Cherry → deduped
      finish: ["oak", "gasoline"],
    });
    expect(out.nose).toEqual(["Vanilla", "Caramel"]);
    expect(out.palate).toEqual(["Cherry"]);
    expect(out.finish).toEqual(["Oak"]);
  });

  it("returns empty arrays for missing / non-array / non-string input", () => {
    expect(sanitizeFlavorTags({})).toEqual({ nose: [], palate: [], finish: [] });
    expect(sanitizeFlavorTags(null)).toEqual({ nose: [], palate: [], finish: [] });
    expect(sanitizeFlavorTags({ nose: "vanilla", palate: [42] })).toEqual({
      nose: [],
      palate: [],
      finish: [],
    });
  });

  it("caps each stage at six tags", () => {
    const many = [
      "Vanilla", "Caramel", "Honey", "Oak", "Cinnamon", "Clove", "Leather",
      "Smoke",
    ];
    expect(sanitizeFlavorTags({ nose: many }).nose).toHaveLength(6);
  });
});

describe("hasAnyTags", () => {
  it("is true only when some stage has a tag", () => {
    expect(hasAnyTags({ nose: [], palate: [], finish: [] })).toBe(false);
    expect(hasAnyTags({ nose: ["Oak"], palate: [], finish: [] })).toBe(true);
  });
});

describe("isAdequateProfile (BB-185)", () => {
  it("requires enough tags spread across enough stages", () => {
    expect(
      isAdequateProfile({
        nose: ["Vanilla", "Oak", "Honey"],
        palate: ["Cherry", "Corn"],
        finish: [],
      })
    ).toBe(true); // 5 tags across 2 stages
  });

  it("rejects thin or single-stage profiles", () => {
    expect(isAdequateProfile({ nose: ["Smoke", "Oak"], palate: [], finish: [] })).toBe(
      false
    ); // only 1 stage
    expect(
      isAdequateProfile({ nose: ["Vanilla"], palate: ["Cherry"], finish: ["Oak"] })
    ).toBe(false); // 3 tags < 5
    expect(isAdequateProfile({ nose: [], palate: [], finish: [] })).toBe(false);
  });
});

describe("mergeFlavorTags / profileToTags / sameTags (BB-185)", () => {
  it("unions per stage, existing first, deduped and capped at 6", () => {
    const merged = mergeFlavorTags(
      { nose: ["Vanilla", "Oak"], palate: ["Cherry"], finish: [] },
      { nose: ["Oak", "Honey"], palate: ["Corn"], finish: ["Leather"] }
    );
    expect(merged.nose).toEqual(["Vanilla", "Oak", "Honey"]); // Oak deduped
    expect(merged.palate).toEqual(["Cherry", "Corn"]);
    expect(merged.finish).toEqual(["Leather"]);
  });

  it("caps a stage at six after merge", () => {
    const merged = mergeFlavorTags(
      { nose: ["Vanilla", "Oak", "Honey", "Corn", "Cherry"], palate: [], finish: [] },
      { nose: ["Smoke", "Leather"], palate: [], finish: [] }
    );
    expect(merged.nose).toHaveLength(6);
    expect(merged.nose).not.toContain("Leather"); // overflow dropped
  });

  it("reads tags out of a stored profile shape", () => {
    expect(
      profileToTags({ nose: ["Oak"], palate: ["Cherry"], source: "ai", model: "x" })
    ).toEqual({ nose: ["Oak"], palate: ["Cherry"], finish: [] });
    expect(profileToTags(null)).toEqual({ nose: [], palate: [], finish: [] });
  });

  it("sameTags detects a no-op merge", () => {
    const t = { nose: ["Oak"], palate: [], finish: [] };
    expect(sameTags(t, t)).toBe(true);
    expect(sameTags(t, { nose: ["Oak", "Smoke"], palate: [], finish: [] })).toBe(false);
  });
});

describe("shouldSweepEnrich (BB-185 proactive backfill)", () => {
  const NOW = 1_000_000_000_000;
  const COOLDOWN = 14 * 24 * 60 * 60 * 1000;
  const adequate = {
    nose: ["Vanilla", "Oak", "Honey"],
    palate: ["Cherry", "Corn"],
    finish: [],
  };
  const thin = { nose: ["Smoke"], palate: [], finish: [] };

  it("skips a bottle with an adequate profile", () => {
    expect(shouldSweepEnrich({ flavorProfile: adequate }, NOW, COOLDOWN)).toBe(false);
  });

  it("enriches an inadequate bottle never attempted", () => {
    expect(shouldSweepEnrich({ flavorProfile: thin }, NOW, COOLDOWN)).toBe(true);
    expect(shouldSweepEnrich({}, NOW, COOLDOWN)).toBe(true);
  });

  it("skips an inadequate bottle attempted within the cooldown", () => {
    const at = { toMillis: () => NOW - 60_000 }; // 1 min ago
    expect(
      shouldSweepEnrich({ flavorProfile: thin, flavorEnrichedAt: at }, NOW, COOLDOWN)
    ).toBe(false);
  });

  it("retries an inadequate bottle attempted before the cooldown", () => {
    const at = { toMillis: () => NOW - COOLDOWN - 1 };
    expect(
      shouldSweepEnrich({ flavorProfile: thin, flavorEnrichedAt: at }, NOW, COOLDOWN)
    ).toBe(true);
  });
});

describe("profileProvenance (BB-222)", () => {
  it("defaults everything on a missing or legacy profile", () => {
    for (const profile of [null, undefined, { nose: ["Vanilla"] }]) {
      expect(profileProvenance(profile)).toEqual({
        tagCounts: {},
        marketingTagCounts: {},
        seededArticleIds: [],
        reviewCount: 0,
      });
    }
  });

  it("reads stored provenance and drops garbage values", () => {
    const p = profileProvenance({
      tagCounts: { Banana: 3, Oak: "many", Corn: -1 },
      marketingTagCounts: { Vanilla: 2 },
      seededArticleIds: ["a1", 7, "a2"],
      reviewCount: 3,
    });
    expect(p.tagCounts).toEqual({ Banana: 3 });
    expect(p.marketingTagCounts).toEqual({ Vanilla: 2 });
    expect(p.seededArticleIds).toEqual(["a1", "a2"]);
    expect(p.reviewCount).toBe(3);
  });
});

describe("applyArticleSeed (BB-222 trust tiers)", () => {
  const empty: { nose: string[]; palate: string[]; finish: string[] } = {
    nose: [],
    palate: [],
    finish: [],
  };
  const noProv = profileProvenance(null);
  const seed = { nose: ["Banana"], palate: ["Banana", "Corn"], finish: [] };

  it("evaluative: merges arrays, counts tags once each, bumps reviewCount", () => {
    const res = applyArticleSeed(empty, noProv, seed, "a1", true);
    expect(res.changed).toBe(true);
    expect(res.tags.palate).toEqual(["Banana", "Corn"]);
    // Banana appears in two stages but counts once — counts are per article.
    expect(res.provenance.tagCounts).toEqual({ Banana: 1, Corn: 1 });
    expect(res.provenance.reviewCount).toBe(1);
    expect(res.provenance.seededArticleIds).toEqual(["a1"]);
    expect(res.provenance.marketingTagCounts).toEqual({});
  });

  it("marketing: counts claims only — arrays and reviewCount untouched", () => {
    const existing = { nose: ["Oak"], palate: [], finish: [] };
    const res = applyArticleSeed(existing, noProv, seed, "pr1", false);
    expect(res.changed).toBe(true);
    expect(res.tags).toEqual(existing); // never enters the profile arrays
    expect(res.provenance.marketingTagCounts).toEqual({ Banana: 1, Corn: 1 });
    expect(res.provenance.tagCounts).toEqual({});
    expect(res.provenance.reviewCount).toBe(0);
    expect(res.provenance.seededArticleIds).toEqual(["pr1"]);
  });

  it("is idempotent per article (re-extraction never double-counts)", () => {
    const first = applyArticleSeed(empty, noProv, seed, "a1", true);
    const again = applyArticleSeed(
      first.tags,
      first.provenance,
      seed,
      "a1",
      true
    );
    expect(again.changed).toBe(false);
    expect(again.provenance.tagCounts).toEqual({ Banana: 1, Corn: 1 });
  });

  it("accumulates counts across distinct articles", () => {
    const first = applyArticleSeed(empty, noProv, seed, "a1", true);
    const second = applyArticleSeed(
      first.tags,
      first.provenance,
      { nose: ["Banana"], palate: [], finish: [] },
      "a2",
      true
    );
    expect(second.provenance.tagCounts).toEqual({ Banana: 2, Corn: 1 });
    expect(second.provenance.reviewCount).toBe(2);
  });

  it("no-ops on an empty seed", () => {
    const res = applyArticleSeed(empty, noProv, empty, "a1", true);
    expect(res.changed).toBe(false);
    expect(res.provenance.seededArticleIds).toEqual([]);
  });

  it("caps seededArticleIds, dropping the oldest", () => {
    let tags = empty;
    let prov = noProv;
    for (let i = 0; i < 32; i++) {
      const res = applyArticleSeed(
        tags,
        prov,
        { nose: ["Oak"], palate: [], finish: [] },
        `a${i}`,
        true
      );
      tags = res.tags;
      prov = res.provenance;
    }
    expect(prov.seededArticleIds).toHaveLength(30);
    expect(prov.seededArticleIds[0]).toBe("a2");
    expect(prov.seededArticleIds[29]).toBe("a31");
  });
});

describe("applyEnrichment — provenance carry-through (BB-222)", () => {
  const provenance = {
    tagCounts: { Banana: 2 },
    marketingTagCounts: { Vanilla: 1 },
    seededArticleIds: ["a1", "pr1"],
    reviewCount: 2,
  };

  it("keeps provenance fields when regenerating a profile", async () => {
    const ref = { update: jest.fn().mockResolvedValue(undefined) };
    await applyEnrichment(
      ref,
      {
        name: "Jimmy Red",
        flavorProfile: { nose: ["Banana"], palate: [], finish: [], ...provenance },
      },
      false,
      async () => ({ nose: ["Corn"], palate: ["Oak"], finish: ["Char"] })
    );
    const written = ref.update.mock.calls[0][0].flavorProfile;
    expect(written.tagCounts).toEqual({ Banana: 2 });
    expect(written.marketingTagCounts).toEqual({ Vanilla: 1 });
    expect(written.seededArticleIds).toEqual(["a1", "pr1"]);
    expect(written.reviewCount).toBe(2);
  });

  it("never nulls a profile that still carries provenance", async () => {
    // A marketing-only bottle: empty arrays but real claims. An empty
    // generation must not wipe the claims by writing flavorProfile: null.
    const ref = { update: jest.fn().mockResolvedValue(undefined) };
    await applyEnrichment(
      ref,
      {
        name: "Obscure Bottle",
        flavorProfile: { nose: [], palate: [], finish: [], ...provenance },
      },
      false,
      async () => ({ nose: [], palate: [], finish: [] })
    );
    const written = ref.update.mock.calls[0][0].flavorProfile;
    expect(written).not.toBeNull();
    expect(written.marketingTagCounts).toEqual({ Vanilla: 1 });
    expect(written.nose).toEqual([]);
  });

  it("still writes null when there are no tags and no provenance", async () => {
    const ref = { update: jest.fn().mockResolvedValue(undefined) };
    await applyEnrichment(ref, { name: "Nobody Knows" }, false, async () => ({
      nose: [],
      palate: [],
      finish: [],
    }));
    expect(ref.update.mock.calls[0][0].flavorProfile).toBeNull();
  });
});

describe("applyEnrichment (BB-185 adequacy gate + merge)", () => {
  const full: FlavorTags = {
    nose: ["Vanilla", "Oak", "Honey"],
    palate: ["Cherry", "Corn"],
    finish: ["Leather"],
  };
  const bottle = { name: "Buffalo Trace", distillery: "BT", category: "bourbon" };

  it("returns cached without generating when the existing profile is adequate", async () => {
    const ref = { update: jest.fn() };
    const generate = jest.fn();
    const res = await applyEnrichment(
      ref,
      { ...bottle, flavorProfile: { ...full, source: "ai" } },
      false,
      generate
    );
    expect(res.status).toBe("cached");
    expect(generate).not.toHaveBeenCalled();
    expect(ref.update).not.toHaveBeenCalled();
  });

  it("upgrades a thin existing profile by generating and MERGING", async () => {
    const ref = { update: jest.fn().mockResolvedValue(undefined) };
    const res = await applyEnrichment(
      ref,
      { ...bottle, flavorProfile: { nose: ["Smoke"], palate: [], finish: [] } },
      false,
      async () => full
    );
    expect(res.status).toBe("augmented");
    const written = ref.update.mock.calls[0][0].flavorProfile;
    expect(written.nose).toEqual(["Smoke", "Vanilla", "Oak", "Honey"]); // seed kept
    expect(written.palate).toEqual(["Cherry", "Corn"]);
  });

  it("generates fresh when there is no existing profile", async () => {
    const ref = { update: jest.fn().mockResolvedValue(undefined) };
    const res = await applyEnrichment(ref, bottle, false, async () => full);
    expect(res.status).toBe("generated");
    expect(ref.update.mock.calls[0][0].flavorProfile.nose).toEqual(full.nose);
  });

  it("regenerates on refresh even when adequate", async () => {
    const ref = { update: jest.fn().mockResolvedValue(undefined) };
    const generate = jest.fn().mockResolvedValue(full);
    const res = await applyEnrichment(
      ref,
      { ...bottle, flavorProfile: { ...full, source: "ai" } },
      true,
      generate
    );
    expect(generate).toHaveBeenCalledTimes(1);
    expect(res.status).toBe("refreshed");
  });

  it("stores null (never wipes) when nothing confident comes back and nothing existed", async () => {
    const ref = { update: jest.fn().mockResolvedValue(undefined) };
    const res = await applyEnrichment(ref, bottle, false, async () => ({
      nose: [],
      palate: [],
      finish: [],
    }));
    expect(res.status).toBe("empty");
    expect(ref.update.mock.calls[0][0].flavorProfile).toBeNull();
  });
});

describe("generateFlavorTags (prompt → model → sanitize)", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("prompts Groq and returns only canonical tags from its reply", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content:
                  '{"nose":["vanilla","made-up"],"palate":["dark cherry"],"finish":["oak"]}',
              },
            },
          ],
        }),
    }) as unknown as typeof fetch;

    const out = await generateFlavorTags({ name: "Buffalo Trace" }, "key");
    expect(out).toEqual({
      nose: ["Vanilla"],
      palate: ["Cherry"],
      finish: ["Oak"],
    });
  });
});

describe("articleFlavorSeed (BB-185 feed a)", () => {
  it("returns canonical seed tags when the article carries notes", () => {
    expect(
      articleFlavorSeed({
        nose: ["vanilla", "oak"],
        palate: ["dark cherry"],
        finish: ["leather"],
      })
    ).toEqual({ nose: ["Vanilla", "Oak"], palate: ["Cherry"], finish: ["Leather"] });
  });

  it("returns null for an announcement article with no usable notes", () => {
    expect(articleFlavorSeed({ nose: [], palate: [], finish: [] })).toBeNull();
    expect(articleFlavorSeed(null)).toBeNull();
    expect(articleFlavorSeed({ nose: ["gasoline", "plastic"] })).toBeNull();
  });
});

describe("buildFlavorPrompt", () => {
  it("constrains the model to the canonical list and JSON shape", () => {
    const { system } = buildFlavorPrompt({ name: "Buffalo Trace" });
    expect(system).toContain("Vanilla");
    expect(system).toContain('{"nose":[],"palate":[],"finish":[]}');
    expect(system).toContain("only labels from the list");
  });

  it("includes distillery and category when present, omits when absent", () => {
    const withAll = buildFlavorPrompt({
      name: "Weller 12",
      distillery: "Buffalo Trace",
      category: "wheat_whiskey",
    });
    expect(withAll.user).toBe(
      "Bottle: Weller 12 | Distillery: Buffalo Trace | Category: wheat_whiskey"
    );
    expect(buildFlavorPrompt({ name: "Mystery" }).user).toBe("Bottle: Mystery");
  });

  it("includes the distinguishing fields when present (BB-196)", () => {
    const { user } = buildFlavorPrompt({
      name: "Russell's Reserve 13",
      distillery: "Wild Turkey",
      category: "bourbon",
      subType: "Kentucky Straight",
      proof: 114.8,
      ageStatement: "13 years",
      series: "Russell's Reserve",
    });
    expect(user).toBe(
      "Bottle: Russell's Reserve 13 | Distillery: Wild Turkey | " +
        "Category: bourbon | Type: Kentucky Straight | Proof: 114.8 | " +
        "Age: 13 years | Series: Russell's Reserve"
    );
  });

  it("asks the model for bottle-specific, non-generic notes (BB-196)", () => {
    const { system } = buildFlavorPrompt({ name: "Buffalo Trace" });
    expect(system.toLowerCase()).toContain("distinguish");
  });
});

describe("BB-196 differentiation refresh", () => {
  const full: FlavorTags = {
    nose: ["Vanilla", "Oak", "Honey"],
    palate: ["Cherry", "Corn"],
    finish: ["Leather"],
  };
  const distinct: FlavorTags = {
    nose: ["Rye Spice", "Mint"],
    palate: ["Cinnamon", "Black Pepper"],
    finish: ["Tobacco", "Dark Chocolate"],
  };
  const bottle = { name: "Sazerac Rye", distillery: "BT", category: "rye" };

  it("refresh REPLACES the old profile instead of merging", async () => {
    const ref = { update: jest.fn().mockResolvedValue(undefined) };
    const res = await applyEnrichment(
      ref,
      { ...bottle, flavorProfile: { ...full, source: "ai" } },
      true,
      async () => distinct
    );
    expect(res.status).toBe("refreshed");
    const written = ref.update.mock.calls[0][0].flavorProfile;
    expect(written.nose).toEqual(distinct.nose); // old generic tags gone
    expect(written.palate).toEqual(distinct.palate);
    expect(written.finish).toEqual(distinct.finish);
  });

  it("a refresh that comes back empty keeps the existing profile", async () => {
    const ref = { update: jest.fn().mockResolvedValue(undefined) };
    const res = await applyEnrichment(
      ref,
      { ...bottle, flavorProfile: { ...full, source: "ai" } },
      true,
      async () => ({ nose: [], palate: [], finish: [] })
    );
    expect(res.status).toBe("cached");
    expect(ref.update).not.toHaveBeenCalled(); // never wipe on a bad refresh
  });

  it("stamps promptVersion on every stored profile", async () => {
    const ref = { update: jest.fn().mockResolvedValue(undefined) };
    await applyEnrichment(ref, bottle, false, async () => distinct);
    const written = ref.update.mock.calls[0][0].flavorProfile;
    expect(written.promptVersion).toBe(FLAVOR_PROMPT_VERSION);
  });

  it("needsPromptUpgrade: true for version-less or stale profiles only", () => {
    expect(needsPromptUpgrade({ flavorProfile: { ...full, source: "ai" } })).toBe(true);
    expect(
      needsPromptUpgrade({
        flavorProfile: { ...full, promptVersion: FLAVOR_PROMPT_VERSION - 1 },
      })
    ).toBe(true);
    expect(
      needsPromptUpgrade({
        flavorProfile: { ...full, promptVersion: FLAVOR_PROMPT_VERSION },
      })
    ).toBe(false);
    expect(needsPromptUpgrade({ flavorProfile: null })).toBe(false);
    expect(needsPromptUpgrade({})).toBe(false);
  });
});
