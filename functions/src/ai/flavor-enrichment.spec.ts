import {
  applyEnrichment,
  buildFlavorPrompt,
  FlavorTags,
  generateFlavorTags,
  hasAnyTags,
  sanitizeFlavorTags,
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

describe("applyEnrichment (BB-185 enrich-once + write)", () => {
  const tags: FlavorTags = { nose: ["Vanilla"], palate: ["Cherry"], finish: ["Oak"] };
  const bottle = { name: "Buffalo Trace", distillery: "BT", category: "bourbon" };

  it("returns the cached profile without generating when already enriched", async () => {
    const ref = { update: jest.fn() };
    const generate = jest.fn();
    const res = await applyEnrichment(
      ref,
      { ...bottle, flavorEnrichedAt: {}, flavorProfile: { nose: ["Corn"] } },
      false,
      generate
    );
    expect(res.status).toBe("cached");
    expect(res.flavorProfile).toEqual({ nose: ["Corn"] });
    expect(generate).not.toHaveBeenCalled();
    expect(ref.update).not.toHaveBeenCalled();
  });

  it("regenerates when refresh is requested despite an existing profile", async () => {
    const ref = { update: jest.fn().mockResolvedValue(undefined) };
    const generate = jest.fn().mockResolvedValue(tags);
    const res = await applyEnrichment(ref, { ...bottle, flavorEnrichedAt: {} }, true, generate);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(res.status).toBe("refreshed");
    expect(ref.update).toHaveBeenCalledTimes(1);
  });

  it("stores a generated profile and marks the bottle enriched", async () => {
    const ref = { update: jest.fn().mockResolvedValue(undefined) };
    const res = await applyEnrichment(ref, bottle, false, async () => tags);
    expect(res.status).toBe("generated");
    expect(res.flavorProfile).toMatchObject({
      nose: ["Vanilla"],
      palate: ["Cherry"],
      finish: ["Oak"],
      source: "ai",
    });
    const written = ref.update.mock.calls[0][0];
    expect(written.flavorProfile.nose).toEqual(["Vanilla"]);
    expect(written.flavorEnrichedAt).toBeDefined();
  });

  it("marks enriched with a null profile when nothing confident comes back", async () => {
    const ref = { update: jest.fn().mockResolvedValue(undefined) };
    const res = await applyEnrichment(ref, bottle, false, async () => ({
      nose: [],
      palate: [],
      finish: [],
    }));
    expect(res.status).toBe("empty");
    expect(res.flavorProfile).toBeNull();
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
