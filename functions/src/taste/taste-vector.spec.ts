import { buildTasteVector, matchTaste, MIN_LIKED_ENTRIES } from "./taste-vector";

const liked = (over: Record<string, unknown> = {}) => ({
  rating: 4.5,
  noseTags: [],
  palateTags: ["Cherry"],
  finishTags: [],
  ...over,
});

describe("buildTasteVector (BB-199, server mirror)", () => {
  it("returns null below the cold-start threshold", () => {
    expect(
      buildTasteVector(Array.from({ length: MIN_LIKED_ENTRIES - 1 }, () => liked()))
    ).toBeNull();
  });

  it("counts tags only from liked, tagged entries and tolerates junk shapes", () => {
    const v = buildTasteVector([
      liked(),
      liked({ palateTags: ["Cherry", "Oak"], noseTags: ["Vanilla"] }),
      liked({ palateTags: ["Cherry"] }),
      { rating: 2, palateTags: ["Smoke"] }, // disliked
      { rating: 5, palateTags: "not-an-array" }, // untagged (junk shape)
      { rating: null, palateTags: ["Peat"] }, // unrated
    ]);
    expect(v?.palate["Cherry"]).toBe(3);
    expect(v?.palate["Oak"]).toBe(1);
    expect(v?.nose["Vanilla"]).toBe(1);
    expect(v?.palate["Smoke"]).toBeUndefined();
    expect(v?.basedOnEntries).toBe(3);
  });
});

describe("matchTaste (BB-199, server mirror)", () => {
  const vector = buildTasteVector([
    liked({ palateTags: ["Cherry", "Rye Spice"], noseTags: ["Vanilla"] }),
    liked({ palateTags: ["Cherry"], finishTags: ["Oak"] }),
    liked({ palateTags: ["Rye Spice"] }),
  ]);

  it("matches palate + second tag; rejects single or weak overlap", () => {
    expect(
      matchTaste(vector, { nose: ["Vanilla"], palate: ["Cherry"], finish: [] }).matched
    ).toBe(true);
    expect(
      matchTaste(vector, { nose: [], palate: ["Cherry"], finish: [] }).matched
    ).toBe(false);
    expect(
      matchTaste(vector, { nose: ["Vanilla"], palate: [], finish: ["Oak"] }).matched
    ).toBe(false);
    expect(matchTaste(null, { nose: [], palate: ["Cherry"], finish: [] }).matched).toBe(false);
  });
});
