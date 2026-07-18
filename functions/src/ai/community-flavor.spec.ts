import {
  COMMUNITY_FLOOR,
  UserTaggedEntry,
  aggregateUserFlavor,
} from "./community-flavor";

const entry = (
  uid: string,
  nose: string[] = [],
  palate: string[] = [],
  finish: string[] = []
): UserTaggedEntry => ({
  uid,
  noseTags: nose,
  palateTags: palate,
  finishTags: finish,
});

describe("aggregateUserFlavor (BB-188)", () => {
  it("returns an empty aggregate for no entries", () => {
    const out = aggregateUserFlavor([]);
    expect(out).toEqual({
      userTags: { nose: [], palate: [], finish: [] },
      userTagCounts: {},
      contributorCount: 0,
    });
  });

  it("counts a tag once per user, not once per entry (dedupe)", () => {
    // User a logs the bottle twice, both 'vanilla'; user b once. Distinct
    // users = 2, so it meets the floor and a single logger can't inflate it.
    const out = aggregateUserFlavor([
      entry("a", [], ["vanilla"]),
      entry("a", [], ["vanilla"]),
      entry("b", [], ["vanilla"]),
    ]);
    expect(out.userTagCounts).toEqual({ vanilla: 2 });
    expect(out.userTags.palate).toEqual(["vanilla"]);
    expect(out.contributorCount).toBe(2);
  });

  it("drops tags below the contributor floor", () => {
    const out = aggregateUserFlavor([entry("a", [], ["cherry"])]);
    expect(out.userTagCounts).toEqual({});
    expect(out.userTags).toEqual({ nose: [], palate: [], finish: [] });
    expect(out.contributorCount).toBe(1); // still a contributor, just no surfaced tag
    expect(COMMUNITY_FLOOR).toBe(2);
  });

  it("places a tag in its plurality stage", () => {
    // oak: palate by a & b, finish by c → plurality palate (2 > 1).
    const out = aggregateUserFlavor([
      entry("a", [], ["oak"]),
      entry("b", [], ["oak"]),
      entry("c", [], [], ["oak"]),
    ]);
    expect(out.userTagCounts).toEqual({ oak: 3 });
    expect(out.userTags.palate).toEqual(["oak"]);
    expect(out.userTags.finish).toEqual([]);
  });

  it("breaks a stage tie by stage order (nose → palate → finish)", () => {
    // smoke: a nose, b palate → 1/1 tie → nose wins; count is cross-stage (2).
    const out = aggregateUserFlavor([
      entry("a", ["smoke"]),
      entry("b", [], ["smoke"]),
    ]);
    expect(out.userTagCounts).toEqual({ smoke: 2 });
    expect(out.userTags.nose).toEqual(["smoke"]);
    expect(out.userTags.palate).toEqual([]);
  });

  it("dedupes a tag a single user placed in multiple stages", () => {
    // a: honey in nose AND palate; b: honey in nose. Distinct users = 2.
    // Per-stage users: nose {a,b}=2, palate {a}=1 → nose.
    const out = aggregateUserFlavor([
      entry("a", ["honey"], ["honey"]),
      entry("b", ["honey"]),
    ]);
    expect(out.userTagCounts).toEqual({ honey: 2 });
    expect(out.userTags.nose).toEqual(["honey"]);
  });

  it("counts a contributor only when they confirmed at least one tag", () => {
    const out = aggregateUserFlavor([
      entry("a", [], ["caramel"]),
      entry("b", [], ["caramel"]),
      entry("c"), // logged the bottle but tagged nothing
    ]);
    expect(out.contributorCount).toBe(2);
  });

  it("trims and drops blank tags", () => {
    const out = aggregateUserFlavor([
      entry("a", [], ["  vanilla  ", ""]),
      entry("b", [], ["vanilla"]),
    ]);
    expect(out.userTagCounts).toEqual({ vanilla: 2 });
    expect(out.userTags.palate).toEqual(["vanilla"]);
  });

  it("orders tags within a stage by descending distinct-user count", () => {
    const out = aggregateUserFlavor([
      entry("a", [], ["oak", "vanilla"]),
      entry("b", [], ["oak", "vanilla"]),
      entry("c", [], ["oak"]),
    ]);
    // oak (3) before vanilla (2)
    expect(out.userTags.palate).toEqual(["oak", "vanilla"]);
  });
});
