import {
  fetchArticlePage,
  fetchSitemap,
  mapArticlePage,
  parseArticleLd,
  parseSitemap,
  selectCandidates,
} from "./sitemap";
import { publishedAt, thumbnailFrom } from "./parse";

// Mirrors breakingbourbon.com's real markup, captured 2026-09-18.
const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.breakingbourbon.com/review/new-one</loc><lastmod>2026-09-18T11:21:00.000Z</lastmod></url>
  <url><loc>https://www.breakingbourbon.com/review/old-one</loc><lastmod>2024-01-02T00:00:00.000Z</lastmod></url>
  <url><loc>https://www.breakingbourbon.com/article/an-article</loc><lastmod>2026-09-18T09:00:00.000Z</lastmod></url>
  <url><loc>https://www.breakingbourbon.com/reviewcallback/junk</loc><lastmod>2026-09-18T09:00:00.000Z</lastmod></url>
  <url><loc>https://www.breakingbourbon.com/review/no-date</loc></url>
</urlset>`;

const PAGE = `<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
 {"@type":"Article",
  "headline":"Heaven Hill Bottled-in-Bond Double Mash",
  "datePublished":"2026-09-18T11:21:00.000Z",
  "description":"Leaning into its distinct grains and age&#8230;",
  "image":["https://cdn.prod.website-files.com/abc/hero.jpg"],
  "author":{"@type":"Person","name":"Written By: Jordan Moskal"}}]}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"Breaking Bourbon"}]}
</script>
</head><body><p>The review body.</p></body></html>`;

describe("parseSitemap", () => {
  it("reads loc/lastmod pairs and tolerates a missing lastmod", () => {
    const e = parseSitemap(SITEMAP);
    expect(e).toHaveLength(5);
    expect(e[0].loc).toBe("https://www.breakingbourbon.com/review/new-one");
    expect(e[0].lastmod?.toISOString()).toBe("2026-09-18T11:21:00.000Z");
    expect(e[4].lastmod).toBeNull();
  });

  it("returns nothing for markup that isn't a urlset", () => {
    expect(parseSitemap("<html><body>not a sitemap</body></html>")).toEqual([]);
  });
});

describe("selectCandidates", () => {
  const now = new Date("2026-09-18T12:00:00.000Z").getTime();
  const opts = { pathPrefix: "/review/", windowDays: 7, now };

  it("keeps only the trusted section, newest first", () => {
    const got = selectCandidates(parseSitemap(SITEMAP), opts);
    expect(got.map((e) => new URL(e.loc).pathname)).toEqual(["/review/new-one"]);
  });

  it("excludes /reviewcallback/ — a prefix match must not be a substring match", () => {
    // 322 of those exist in the real sitemap and some 404.
    const got = selectCandidates(parseSitemap(SITEMAP), opts);
    expect(got.some((e) => e.loc.includes("reviewcallback"))).toBe(false);
  });

  it("drops entries outside the lastmod window and entries with no lastmod", () => {
    const got = selectCandidates(parseSitemap(SITEMAP), opts);
    expect(got.some((e) => e.loc.endsWith("old-one"))).toBe(false);
    expect(got.some((e) => e.loc.endsWith("no-date"))).toBe(false);
  });

  it("widening the window reaches further back", () => {
    const got = selectCandidates(parseSitemap(SITEMAP), {
      ...opts,
      windowDays: 2000,
    });
    expect(got.map((e) => new URL(e.loc).pathname)).toEqual([
      "/review/new-one",
      "/review/old-one",
    ]);
  });
});

describe("parseArticleLd", () => {
  it("finds the Article inside an @graph, past other blocks", () => {
    const ld = parseArticleLd(PAGE);
    expect(ld?.headline).toBe("Heaven Hill Bottled-in-Bond Double Mash");
    expect(ld?.datePublished).toBe("2026-09-18T11:21:00.000Z");
  });

  it("survives a malformed block and keeps looking", () => {
    const html =
      "<script type=\"application/ld+json\">{ not json </script>" + PAGE;
    expect(parseArticleLd(html)?.headline).toBeTruthy();
  });

  it("returns null when there is no Article (the non-review sections)", () => {
    const html =
      "<script type=\"application/ld+json\">{\"@type\":\"Organization\"}</script>";
    expect(parseArticleLd(html)).toBeNull();
  });
});

describe("mapArticlePage", () => {
  const url = "https://www.breakingbourbon.com/review/heaven-hill";

  it("maps headline, date, excerpt and hero onto the feed-item shape", () => {
    const item = mapArticlePage(PAGE, url)!;
    expect(item.title).toBe("Heaven Hill Bottled-in-Bond Double Mash");
    expect(item.contentSnippet).toBe("Leaning into its distinct grains and age…");
    expect(item.link).toBe(url);
    expect(publishedAt(item)).toEqual(new Date("2026-09-18T11:21:00.000Z"));
  });

  it("feeds the JSON-LD image into the existing thumbnail ladder", () => {
    const item = mapArticlePage(PAGE, url)!;
    expect(thumbnailFrom(item, url)).toBe(
      "https://cdn.prod.website-files.com/abc/hero.jpg"
    );
  });

  it("falls back to an inline body image when JSON-LD has none", () => {
    const noImg = PAGE.replace(
      "\"image\":[\"https://cdn.prod.website-files.com/abc/hero.jpg\"],",
      ""
    ).replace("<p>The review body.</p>", "<img src=\"https://x.com/inline.jpg\">");
    const item = mapArticlePage(noImg, url)!;
    expect(thumbnailFrom(item, url)).toBe("https://x.com/inline.jpg");
  });

  it("SKIPS a page with no usable date rather than inventing one", () => {
    // lastmod is not a stand-in: /whiskey-roundup/april-2021 carries
    // lastmod=2022-11-11. A fabricated publishedAt would misorder the feed and
    // defeat the 90-day ingest filter, so no date means no article.
    const noDate = PAGE.replace("\"datePublished\":\"2026-09-18T11:21:00.000Z\",", "");
    expect(mapArticlePage(noDate, url)).toBeNull();
  });

  it("skips a page with no Article JSON-LD at all", () => {
    expect(mapArticlePage("<html><body>nothing</body></html>", url)).toBeNull();
  });

  it("skips a page whose date is unparseable", () => {
    const bad = PAGE.replace("2026-09-18T11:21:00.000Z", "not-a-date");
    expect(mapArticlePage(bad, url)).toBeNull();
  });
});

describe("fetchSitemap", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("returns parsed entries on success", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => SITEMAP,
    }) as unknown as typeof fetch;
    const entries = await fetchSitemap("https://x.com/sitemap.xml");
    expect(entries).toHaveLength(5);
  });

  it("THROWS on a non-OK response so the source is logged as failed", async () => {
    // Unlike a page fetch, a broken sitemap means the whole source produced
    // nothing — that should surface as an error, not a silent empty run.
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 }) as
      unknown as typeof fetch;
    await expect(fetchSitemap("https://x.com/sitemap.xml")).rejects.toThrow(
      "sitemap 503"
    );
  });
});

describe("fetchArticlePage", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("maps a page on success", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      url: "https://x.com/review/a",
      text: async () => PAGE,
    }) as unknown as typeof fetch;
    const item = await fetchArticlePage("https://x.com/review/a");
    expect(item?.title).toBe("Heaven Hill Bottled-in-Bond Double Mash");
  });

  it("returns null on 404 rather than throwing", async () => {
    // The sitemap lists URLs that 404; one dead page must not fail the source.
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 }) as
      unknown as typeof fetch;
    expect(await fetchArticlePage("https://x.com/review/gone")).toBeNull();
  });

  it("returns null when the network throws", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("ECONNRESET")) as
      unknown as typeof fetch;
    expect(await fetchArticlePage("https://x.com/review/a")).toBeNull();
  });
});
