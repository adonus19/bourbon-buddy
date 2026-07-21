import {
  applyArticleSeed,
  applyEnrichment,
  blendedProfileTags,
  hasArticleNotes,
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
        producerCount: 0,
        userTags: { nose: [], palate: [], finish: [] },
        userTagCounts: {},
        contributorCount: 0,
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

  it("reads the BB-188 community tier", () => {
    const p = profileProvenance({
      userTags: { nose: ["Oak"], palate: ["Cherry"], finish: [] },
      userTagCounts: { Oak: 3, Cherry: 2, Junk: 0 },
      contributorCount: 4,
    });
    expect(p.userTags).toEqual({ nose: ["Oak"], palate: ["Cherry"], finish: [] });
    expect(p.userTagCounts).toEqual({ Oak: 3, Cherry: 2 });
    expect(p.contributorCount).toBe(4);
  });
});

describe("blendedProfileTags (BB-188)", () => {
  it("unions community userTags over the review/AI arrays, community first", () => {
    const blended = blendedProfileTags({
      nose: ["Vanilla"],
      palate: ["Corn"],
      finish: [],
      userTags: { nose: ["Oak"], palate: ["Corn"], finish: ["Char"] },
    });
    expect(blended.nose).toEqual(["Oak", "Vanilla"]); // community first
    expect(blended.palate).toEqual(["Corn"]); // deduped
    expect(blended.finish).toEqual(["Char"]);
  });

  it("equals the raw arrays when there is no community tier", () => {
    const profile = { nose: ["Vanilla"], palate: [], finish: [] };
    expect(blendedProfileTags(profile)).toEqual(profileToTags(profile));
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

  it("producer: seeds arrays too, counts in marketingTagCounts + producerCount (BB-227)", () => {
    // Human-transcribed producer notes now enter the profile arrays (beating an
    // AI guess), while still labelled as a distillery claim via marketingTagCounts.
    const existing = { nose: ["Oak"], palate: [], finish: [] };
    const res = applyArticleSeed(existing, noProv, seed, "pr1", false);
    expect(res.changed).toBe(true);
    expect(res.tags.nose).toEqual(["Oak", "Banana"]); // merged into the arrays
    expect(res.tags.palate).toEqual(["Banana", "Corn"]);
    expect(res.provenance.marketingTagCounts).toEqual({ Banana: 1, Corn: 1 });
    expect(res.provenance.producerCount).toBe(1);
    expect(res.provenance.tagCounts).toEqual({});
    expect(res.provenance.reviewCount).toBe(0);
    expect(res.provenance.seededArticleIds).toEqual(["pr1"]);
  });

  it("replaceBase: a real seed REPLACES AI-only arrays instead of merging (BB-227)", () => {
    const aiGuess = { nose: ["Vanilla", "Caramel"], palate: ["Oak"], finish: [] };
    const res = applyArticleSeed(aiGuess, noProv, seed, "pr1", false, true);
    expect(res.changed).toBe(true);
    // The AI guess (Vanilla/Caramel/Oak) is gone; only the article notes remain.
    expect(res.tags.nose).toEqual(["Banana"]);
    expect(res.tags.palate).toEqual(["Banana", "Corn"]);
    expect(res.tags.nose).not.toContain("Vanilla");
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

  // BB-233 backfill: a force re-extraction re-seeds an article that was already
  // counted, now carrying the finish the old schema dropped. remerge unions the
  // new tags into the arrays WITHOUT re-bumping counts or seededArticleIds — so
  // finish is recovered while the "never double-count" invariant holds.
  it("remerge: recovers newly-captured finish without double-counting", () => {
    const first = applyArticleSeed(
      empty,
      noProv,
      { nose: ["Banana"], palate: ["Corn"], finish: [] },
      "a1",
      true
    );
    expect(first.tags.finish).toEqual([]); // old schema dropped finish

    const withFinish = { nose: ["Banana"], palate: ["Corn"], finish: ["Oak"] };
    const backfilled = applyArticleSeed(
      first.tags,
      first.provenance,
      withFinish,
      "a1",
      true,
      false,
      true // remerge
    );
    expect(backfilled.changed).toBe(true);
    expect(backfilled.tags.finish).toEqual(["Oak"]); // finish recovered
    // Counts and idempotency ledger are untouched — the review was already counted.
    expect(backfilled.provenance.tagCounts).toEqual({ Banana: 1, Corn: 1 });
    expect(backfilled.provenance.reviewCount).toBe(1);
    expect(backfilled.provenance.seededArticleIds).toEqual(["a1"]);
  });

  it("remerge: no-op (changed=false) when the re-seed adds no new tags", () => {
    const seed3 = { nose: ["Banana"], palate: ["Corn"], finish: ["Oak"] };
    const first = applyArticleSeed(empty, noProv, seed3, "a1", true);
    const again = applyArticleSeed(
      first.tags,
      first.provenance,
      seed3,
      "a1",
      true,
      false,
      true // remerge, identical tags
    );
    expect(again.changed).toBe(false);
    expect(again.tags).toEqual(first.tags);
    expect(again.provenance.reviewCount).toBe(1);
  });
});

describe("applyEnrichment — AI is a last resort (BB-227)", () => {
  it("does NOT AI-enrich a bottle that already has review notes", async () => {
    const ref = { update: jest.fn().mockResolvedValue(undefined) };
    const generate = jest.fn(async () => ({
      nose: ["Corn"],
      palate: ["Oak"],
      finish: ["Char"],
    }));
    const res = await applyEnrichment(
      ref,
      {
        name: "Jimmy Red",
        flavorProfile: {
          nose: ["Banana"],
          palate: [],
          finish: [],
          tagCounts: { Banana: 2 },
          reviewCount: 2,
        },
      },
      false,
      generate
    );
    expect(generate).not.toHaveBeenCalled(); // real notes win — no AI guess
    expect(ref.update).not.toHaveBeenCalled();
    expect(res.status).toBe("cached");
  });

  it("does NOT AI-enrich a bottle with only producer notes, even on refresh", async () => {
    const ref = { update: jest.fn().mockResolvedValue(undefined) };
    const generate = jest.fn(async () => ({ nose: ["Vanilla"], palate: [], finish: [] }));
    await applyEnrichment(
      ref,
      {
        name: "Port Finish LE",
        flavorProfile: {
          nose: ["Blackberry"],
          palate: ["Dark Chocolate"],
          finish: ["Roasted Nuts"],
          marketingTagCounts: { Blackberry: 1 },
          producerCount: 1,
        },
      },
      true, // even a forced refresh must not overlay AI on real notes
      generate
    );
    expect(generate).not.toHaveBeenCalled();
    expect(ref.update).not.toHaveBeenCalled();
  });

  it("DOES AI-enrich a bottle with no article notes", async () => {
    const ref = { update: jest.fn().mockResolvedValue(undefined) };
    const generate = jest.fn(async () => ({
      nose: ["Vanilla"],
      palate: ["Oak"],
      finish: ["Char"],
    }));
    await applyEnrichment(ref, { name: "Unknown Bottle" }, false, generate);
    expect(generate).toHaveBeenCalled();
    const written = ref.update.mock.calls[0][0].flavorProfile;
    expect(written.nose).toEqual(["Vanilla"]);
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

  it("carries the community tier through an AI enrichment (no article notes)", async () => {
    // A community-only bottle (userTags but no review/producer) still gets an AI
    // guess, and the community fields must survive the regeneration.
    const ref = { update: jest.fn().mockResolvedValue(undefined) };
    await applyEnrichment(
      ref,
      {
        name: "Community Only",
        flavorProfile: {
          nose: [],
          palate: [],
          finish: [],
          userTags: { nose: ["Oak"], palate: [], finish: [] },
          userTagCounts: { Oak: 2 },
          contributorCount: 2,
        },
      },
      false,
      async () => ({ nose: ["Vanilla"], palate: ["Corn"], finish: ["Char"] })
    );
    const written = ref.update.mock.calls[0][0].flavorProfile;
    expect(written.userTagCounts).toEqual({ Oak: 2 });
    expect(written.contributorCount).toBe(2);
  });
});

describe("hasArticleNotes (BB-227 AI gate)", () => {
  const base = profileProvenance(null);
  it("is true for review, producer, or any seeded article", () => {
    expect(hasArticleNotes({ ...base, reviewCount: 1 })).toBe(true);
    expect(hasArticleNotes({ ...base, producerCount: 1 })).toBe(true);
    expect(hasArticleNotes({ ...base, marketingTagCounts: { Oak: 1 } })).toBe(true);
    expect(hasArticleNotes({ ...base, seededArticleIds: ["a1"] })).toBe(true);
  });
  it("is false for a bare or community-only profile (AI may run)", () => {
    expect(hasArticleNotes(base)).toBe(false);
    expect(hasArticleNotes({ ...base, contributorCount: 5, userTagCounts: { Oak: 5 } })).toBe(
      false
    );
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

  it("prompts the model and returns only canonical tags from its reply", async () => {
    // Gemini API reply shape (BB-226), with Gemma's trailing-fence quirk.
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: '{"nose":["vanilla","made-up"],"palate":["dark cherry"],"finish":["oak"]}\n```',
                  },
                ],
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
