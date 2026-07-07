import {
  applyEnrichment,
  articleFlavorSeed,
  buildFlavorPrompt,
  FlavorTags,
  generateFlavorTags,
  hasAnyTags,
  isAdequateProfile,
  mergeFlavorTags,
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
});
