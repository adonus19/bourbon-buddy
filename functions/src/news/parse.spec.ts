import {
  categorize,
  firstImageIn,
  normalizeImageUrl,
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

describe("normalizeImageUrl", () => {
  it("keeps absolute http(s) URLs and decodes escaped query strings", () => {
    expect(normalizeImageUrl("https://x.com/a.jpg")).toBe("https://x.com/a.jpg");
    expect(normalizeImageUrl("https://x.com/a.jpg?w=1&amp;h=2")).toBe(
      "https://x.com/a.jpg?w=1&h=2"
    );
  });

  it("upgrades protocol-relative and resolves site-relative srcs", () => {
    expect(normalizeImageUrl("//cdn.x.com/a.jpg")).toBe(
      "https://cdn.x.com/a.jpg"
    );
    expect(normalizeImageUrl("/img/a.jpg", "https://x.com/post/1")).toBe(
      "https://x.com/img/a.jpg"
    );
  });

  it("rejects non-http schemes, junk, and unresolvable relatives", () => {
    expect(normalizeImageUrl("data:image/gif;base64,R0lGOD")).toBeNull();
    expect(normalizeImageUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeImageUrl("https://x.com/1x1.gif")).toBeNull();
    expect(normalizeImageUrl("https://stats.wordpress.com/g.gif")).toBeNull();
    expect(normalizeImageUrl("https://x.com/avatar/me.png")).toBeNull();
    expect(normalizeImageUrl("/img/a.jpg")).toBeNull(); // no base to resolve
    expect(normalizeImageUrl(undefined)).toBeNull();
  });
});

describe("firstImageIn", () => {
  it("returns the first real image in document order", () => {
    const html = "<p>hi</p><img src=\"https://x.com/hero.jpg\"><img src=\"https://x.com/b.jpg\">";
    expect(firstImageIn(html)).toBe("https://x.com/hero.jpg");
  });

  it("skips icon-sized images (tracking pixels)", () => {
    const html =
      "<img src=\"https://x.com/p.gif\" width=\"1\" height=\"1\">" +
      "<img src=\"https://x.com/hero.jpg\">";
    expect(firstImageIn(html)).toBe("https://x.com/hero.jpg");
  });

  it("falls back to lazy-loading attributes when src is a placeholder", () => {
    const html =
      "<img src=\"data:image/gif;base64,R0lGOD\" data-src=\"https://x.com/hero.jpg\">";
    expect(firstImageIn(html)).toBe("https://x.com/hero.jpg");
  });

  it("uses the first srcset candidate as a last resort", () => {
    const html = "<img srcset=\"https://x.com/a-500.jpg 500w, https://x.com/a.jpg 1000w\">";
    expect(firstImageIn(html)).toBe("https://x.com/a-500.jpg");
  });

  it("handles single quotes and no image at all", () => {
    expect(firstImageIn("<img src='https://x.com/a.jpg'>")).toBe(
      "https://x.com/a.jpg"
    );
    expect(firstImageIn("<p>no images here</p>")).toBeNull();
    expect(firstImageIn(undefined)).toBeNull();
  });
});

// Each case below mirrors the real markup of a live source, captured 2026-09-18
// while diagnosing why so few articles showed an image (BB-238).
describe("thumbnailFrom", () => {
  it("prefers enclosure, then media:content, then media:thumbnail", () => {
    expect(thumbnailFrom({ enclosure: { url: "https://x.com/e.jpg" } })).toBe(
      "https://x.com/e.jpg"
    );
    expect(
      thumbnailFrom({ "media:content": { $: { url: "https://x.com/m.jpg" } } })
    ).toBe("https://x.com/m.jpg");
    expect(
      thumbnailFrom({ "media:thumbnail": { $: { url: "https://x.com/t.jpg" } } })
    ).toBe("https://x.com/t.jpg");
  });

  it("reads content:encoded — NOT content — for WordPress feeds", () => {
    // The Whiskey Wash / BourbonBlog / The Daily Pour shape. rss-parser puts
    // content:encoded on its own key and overwrites `content` with the teaser,
    // so reading `content` here would miss the hero entirely.
    const item = {
      "content:encoded":
        "<p><img src=\"https://bourbonblog.com/wp-content/uploads/2026/09/hero.png\"></p>",
      content: "<p>Just the teaser text, no image.</p>",
    };
    expect(thumbnailFrom(item)).toBe(
      "https://bourbonblog.com/wp-content/uploads/2026/09/hero.png"
    );
  });

  it("falls back to the description when there is no content:encoded", () => {
    // Bourbon Guy (Squarespace) puts its only image in <description>.
    const item = {
      content:
        "<img src=\"https://images.squarespace-cdn.com/content/v1/abc/hero.jpg\">",
    };
    expect(thumbnailFrom(item)).toBe(
      "https://images.squarespace-cdn.com/content/v1/abc/hero.jpg"
    );
  });

  it("returns null for a teaser-only feed so og:image can take over", () => {
    // Fred Minnick: no enclosure, no media:*, no content:encoded, and a
    // description of bare <p> text. The channel-level 32x32 favicon must never
    // leak in as a hero — it is not part of the item at all.
    const item = {
      content:
        "<p>Garrison Brothers Distillery announced that co-founder...</p>" +
        "<p>The post <a href=\"https://www.fredminnick.com/x/\">Title</a> appeared first.</p>",
      link: "https://www.fredminnick.com/x/",
    };
    expect(thumbnailFrom(item)).toBeNull();
    expect(thumbnailFrom({})).toBeNull();
  });

  it("resolves a relative src against the item link", () => {
    expect(
      thumbnailFrom({
        "content:encoded": "<img src=\"/uploads/hero.jpg\">",
        link: "https://x.com/2026/09/post/",
      })
    ).toBe("https://x.com/uploads/hero.jpg");
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
