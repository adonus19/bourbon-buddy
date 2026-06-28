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
}

export const RSS_SOURCES: RssSource[] = [
  { name: "The Whiskey Wash", url: "https://thewhiskeywash.com/feed" },
  { name: "Fred Minnick", url: "https://fredminnick.com/news/feed" },
  { name: "The Spirits Business", url: "https://www.thespiritsbusiness.com/feed" },
  { name: "BourbonBlog", url: "https://bourbonblog.com/feed" },
  { name: "Bourbon Guy", url: "https://www.bourbonguy.com/blog?format=rss" },
  { name: "Bourbon & Banter", url: "https://www.bourbonbanter.com/feed/" },
  // Formerly Whiskey Raiders → Bottle Raiders → The Daily Pour.
  { name: "The Daily Pour", url: "https://thedailypour.com/feed/" },
];
