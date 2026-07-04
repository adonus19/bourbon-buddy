import {
  categorize,
  publishedAt,
  thumbnailFrom,
  urlHash,
} from "./parse";

describe("urlHash", () => {
  it("is deterministic and 40 hex chars (sha1)", () => {
    const h = urlHash("https://example.com/a");
    expect(h).toMatch(/^[0-9a-f]{40}$/);
    expect(urlHash("https://example.com/a")).toBe(h);
  });

  it("differs for different URLs", () => {
    expect(urlHash("https://a.com")).not.toBe(urlHash("https://b.com"));
  });
});

describe("categorize", () => {
  it("always includes the general catch-all", () => {
    expect(categorize("random text")).toEqual(["general"]);
  });

  it("tags releases, awards, events, and distillery news", () => {
    expect(categorize("New release unveiled")).toContain("release");
    expect(categorize("Wins gold medal")).toContain("award");
    expect(categorize("Bourbon festival returns")).toContain("event");
    expect(categorize("Distillery expands")).toContain("distillery");
  });

  it("can apply multiple categories at once", () => {
    const cats = categorize("New release wins gold at the expo");
    expect(cats).toEqual(
      expect.arrayContaining(["general", "release", "award", "event"])
    );
  });
});

describe("thumbnailFrom", () => {
  it("prefers enclosure, then media:content, else null", () => {
    expect(thumbnailFrom({ enclosure: { url: "e.jpg" } })).toBe("e.jpg");
    expect(
      thumbnailFrom({ "media:content": { $: { url: "m.jpg" } } })
    ).toBe("m.jpg");
    expect(thumbnailFrom({})).toBeNull();
  });
});

describe("publishedAt", () => {
  it("parses isoDate, falling back to pubDate", () => {
    expect(publishedAt({ isoDate: "2026-03-01T00:00:00Z" })).toEqual(
      new Date("2026-03-01T00:00:00Z")
    );
    expect(publishedAt({ pubDate: "Wed, 01 Mar 2026 00:00:00 GMT" })).toEqual(
      new Date("Wed, 01 Mar 2026 00:00:00 GMT")
    );
  });

  it("returns null when missing or invalid", () => {
    expect(publishedAt({})).toBeNull();
    expect(publishedAt({ isoDate: "not-a-date" })).toBeNull();
  });
});
