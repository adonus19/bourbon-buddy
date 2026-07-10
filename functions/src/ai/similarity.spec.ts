import {
  BottleForSimilarity,
  computeNeighbors,
  MAX_NEIGHBORS,
  MIN_SIMILARITY_SCORE,
  similarityScore,
} from "./similarity";

const bottle = (
  id: string,
  tags: Partial<{ nose: string[]; palate: string[]; finish: string[] }>,
  category: string | null = "bourbon",
  name = id
): BottleForSimilarity => ({
  id,
  name,
  category,
  tags: { nose: [], palate: [], finish: [], ...tags },
});

describe("similarityScore (BB-197)", () => {
  it("weights palate over nose and finish", () => {
    const a = bottle("a", { palate: ["Cherry"], nose: [], finish: [] });
    const b = bottle("b", { palate: ["Cherry"], nose: [], finish: [] });
    const c = bottle("c", { nose: ["Cherry"], palate: [], finish: [] });
    // same-category boost applies to both; palate overlap must outscore nose.
    expect(similarityScore(a, b).score).toBeGreaterThan(
      similarityScore(a, c).score
    );
  });

  it("boosts same-category pairs over cross-category", () => {
    const rye = bottle("r", { palate: ["Cherry"] }, "rye");
    const rye2 = bottle("r2", { palate: ["Cherry"] }, "rye");
    const scotch = bottle("s", { palate: ["Cherry"] }, "scotch");
    expect(similarityScore(rye, rye2).score).toBeGreaterThan(
      similarityScore(rye, scotch).score
    );
  });

  it("collects shared tags palate-first for explainability", () => {
    const a = bottle("a", {
      nose: ["Vanilla", "Mint"],
      palate: ["Cherry", "Rye Spice"],
      finish: ["Oak"],
    });
    const b = bottle("b", {
      nose: ["Mint"],
      palate: ["Rye Spice"],
      finish: ["Oak", "Leather"],
    });
    expect(similarityScore(a, b).sharedTags).toEqual([
      "Rye Spice",
      "Mint",
      "Oak",
    ]);
  });

  it("scores zero with no overlap", () => {
    const a = bottle("a", { palate: ["Cherry"] });
    const b = bottle("b", { palate: ["Smoke"] });
    expect(similarityScore(a, b).score).toBe(0);
  });
});

describe("computeNeighbors (BB-197)", () => {
  it("returns mutual top neighbors above the floor, best first", () => {
    const a = bottle("a", { palate: ["Cherry", "Oak"], nose: ["Vanilla"] });
    const near = bottle("near", { palate: ["Cherry", "Oak"], nose: ["Vanilla"] });
    const far = bottle("far", { palate: ["Cherry"], nose: [] });
    const none = bottle("none", { palate: ["Smoke"], nose: ["Peat"] });
    const map = computeNeighbors([a, near, far, none]);

    const forA = map.get("a") ?? [];
    expect(forA[0]?.bourbonId).toBe("near");
    expect(forA.map((n) => n.bourbonId)).not.toContain("none");
    // 'far' shares one palate tag: score 2 * 1.15 boost = 2.3 < floor of 3.
    expect(forA.map((n) => n.bourbonId)).not.toContain("far");
  });

  it("caps each list at MAX_NEIGHBORS", () => {
    const shared = { palate: ["Cherry", "Oak"], nose: ["Vanilla"] };
    const bottles = [
      bottle("hub", shared),
      ...Array.from({ length: MAX_NEIGHBORS + 3 }, (_, i) =>
        bottle(`n${i}`, shared)
      ),
    ];
    const map = computeNeighbors(bottles);
    expect(map.get("hub")).toHaveLength(MAX_NEIGHBORS);
  });

  it("a bottle with a single qualifying neighbor still gets it (floor=1 match)", () => {
    const a = bottle("a", { palate: ["Cherry"], nose: ["Vanilla"] });
    const only = bottle("only", { palate: ["Cherry"], nose: ["Vanilla"] });
    const map = computeNeighbors([a, only]);
    expect(map.get("a")).toHaveLength(1);
    expect(map.get("only")).toHaveLength(1);
  });

  it("carries name/category and shared tags onto the neighbor entries", () => {
    const a = bottle("a", { palate: ["Cherry"], nose: ["Vanilla"] }, "rye", "Sazerac");
    const b = bottle("b", { palate: ["Cherry"], nose: ["Vanilla"] }, "rye", "Rittenhouse");
    const forA = computeNeighbors([a, b]).get("a") ?? [];
    expect(forA[0]).toEqual({
      bourbonId: "b",
      name: "Rittenhouse",
      category: "rye",
      sharedTags: ["Cherry", "Vanilla"],
    });
  });

  it("exposes a floor that one weighted palate match alone does not clear", () => {
    expect(MIN_SIMILARITY_SCORE).toBeGreaterThan(2);
  });
});
