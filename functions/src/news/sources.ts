/**
 * Initial RSS source list (UI/UX feature spec §5a). Hardcoded for now; moving
 * this to Firebase Remote Config (so sources can change without a redeploy) is
 * an easy follow-up — read a JSON param here and fall back to this list.
 *
 * Every URL below was verified to return current (<90 day) feed items. Removed
 * (2026-06-28) after the production logs showed them dead or stale:
 *   Breaking Bourbon (no public RSS — 404 on /articles/feed, /feed, /rss.xml)
 *   Whisky Advocate  (no public RSS — 404)
 *   The Bourbon Review / gobourbon.com (feed alive but all items >90 days)
 *   Modern Thirst    (only resolves at /feed/, returns off-topic drinks PR)
 *   GlobeNewswire    (tag search is an HTML page, not a feed)
 */
export interface RssSource {
  name: string;
  url: string;
  /**
   * How to read this source. "rss" (default) parses an XML feed; "wp-json"
   * reads the WordPress REST API, for publishers that still post daily but no
   * longer expose a feed (BB-240). `url` is the wp/v2 posts endpoint then.
   */
  kind?: "rss" | "wp-json" | "sitemap";
  /**
   * "sitemap" only (BB-245): `url` is the sitemap, and these bound what we read
   * from it. `pathPrefix` restricts ingest to the section whose pages carry a
   * real publish date — see sitemap.ts for why lastmod cannot stand in for one.
   */
  sitemap?: {
    pathPrefix: string;
    /** How far back a `lastmod` may be for a URL to be worth checking. */
    windowDays: number;
    /** Hard cap on page fetches per run, so a mass re-publish can't stampede. */
    maxFetchesPerRun: number;
  };
}

export const RSS_SOURCES: RssSource[] = [
  { name: "The Whiskey Wash", url: "https://thewhiskeywash.com/feed" },
  { name: "Fred Minnick", url: "https://fredminnick.com/news/feed" },
  // BB-240: no RSS any more — every feed path serves the homepage HTML and the
  // page declares no autodiscovery links, so rss-parser failed every cycle with
  // "Invalid character in entity name". The REST API is alive and richer.
  {
    name: "The Spirits Business",
    url: "https://www.thespiritsbusiness.com/wp-json/wp/v2/posts",
    kind: "wp-json",
  },
  { name: "BourbonBlog", url: "https://bourbonblog.com/feed" },
  { name: "Bourbon Guy", url: "https://www.bourbonguy.com/blog?format=rss" },
  { name: "Bourbon & Banter", url: "https://www.bourbonbanter.com/feed/" },
  // Formerly Whiskey Raiders → Bottle Raiders → The Daily Pour.
  { name: "The Daily Pour", url: "https://thedailypour.com/feed/" },
  // BB-245: Webflow, no feed of any kind. Ingested from the sitemap, restricted
  // to /review/ — the only section whose pages carry a real datePublished (in
  // JSON-LD). Reviews are also what BB-220 values most: independent_review keeps
  // flavor-seeding rights, press releases don't.
  {
    name: "Breaking Bourbon",
    url: "https://www.breakingbourbon.com/sitemap.xml",
    kind: "sitemap",
    sitemap: { pathPrefix: "/review/", windowDays: 7, maxFetchesPerRun: 25 },
  },
];
