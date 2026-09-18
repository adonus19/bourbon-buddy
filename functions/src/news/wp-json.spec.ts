import { mapWpPost, wpQuery } from "./wp-json";
import { thumbnailFrom, publishedAt } from "./parse";

// Mirrors a real wp/v2 payload from thespiritsbusiness.com, captured 2026-09-18.
const post = {
  link: "https://www.thespiritsbusiness.com/2026/09/swa-english-whisky-gi/",
  date_gmt: "2026-09-18T11:41:19",
  date: "2026-09-18T12:41:19",
  title: { rendered: "SWA &#8216;profoundly concerned&#8217; about GI" },
  excerpt: { rendered: "<p>MPs have raised objections&#8230;</p>" },
  content: { rendered: "<p>The Scotch Whisky Association said&#8230;</p>" },
  _embedded: {
    "wp:featuredmedia": [
      { source_url: "https://www.thespiritsbusiness.com/content/uploads/2026/05/whisky.jpg" },
    ],
  },
};

describe("wpQuery", () => {
  it("limits fields and embeds only the featured image", () => {
    const q = wpQuery("https://x.com/wp-json/wp/v2/posts", 20);
    expect(q).toContain("per_page=20");
    expect(q).toContain("_embed=wp:featuredmedia");
    expect(q).toContain("_fields=");
  });

  it("appends correctly when the base already has a query string", () => {
    expect(wpQuery("https://x.com/wp-json/wp/v2/posts?categories=7", 5)).toContain(
      "?categories=7&per_page=5"
    );
  });
});

describe("mapWpPost", () => {
  it("decodes entities out of the rendered title and excerpt", () => {
    const item = mapWpPost(post)!;
    // &#8216;/&#8217; are curly quotes, not ASCII apostrophes — the decode is
    // what stops "&#8216;" reaching the headline on the card.
    expect(item.title).toBe("SWA \u2018profoundly concerned\u2019 about GI");
    expect(item.contentSnippet).toBe("MPs have raised objections…");
  });

  it("carries the real article link, not a redirect", () => {
    expect(mapWpPost(post)!.link).toBe(post.link);
  });

  it("treats date_gmt as UTC — it has no zone designator", () => {
    const item = mapWpPost(post)!;
    expect(item.isoDate).toBe("2026-09-18T11:41:19Z");
    // The local `date` is an hour later; parsing date_gmt as local would skew it.
    expect(publishedAt(item)).toEqual(new Date("2026-09-18T11:41:19Z"));
  });

  it("does not double-stamp a date that already carries a zone", () => {
    const item = mapWpPost({ ...post, date_gmt: "2026-09-18T11:41:19Z" })!;
    expect(item.isoDate).toBe("2026-09-18T11:41:19Z");
  });

  it("feeds the featured image into the existing thumbnail ladder", () => {
    const item = mapWpPost(post)!;
    expect(thumbnailFrom(item, item.link)).toBe(
      "https://www.thespiritsbusiness.com/content/uploads/2026/05/whisky.jpg"
    );
  });

  it("falls back to an inline body image when there is no featured media", () => {
    const noMedia = {
      ...post,
      _embedded: undefined,
      content: { rendered: "<p><img src=\"https://x.com/inline.jpg\"></p>" },
    };
    const item = mapWpPost(noMedia)!;
    expect(thumbnailFrom(item, item.link)).toBe("https://x.com/inline.jpg");
  });

  it("exposes the body as content:encoded so bodyText picks it up (BB-239)", () => {
    expect(mapWpPost(post)!["content:encoded"]).toContain("Scotch Whisky Association");
  });

  it("drops a post with no link — there'd be nothing to key the doc on", () => {
    expect(mapWpPost({ ...post, link: undefined })).toBeNull();
    expect(mapWpPost({ ...post, link: "   " })).toBeNull();
  });
});
