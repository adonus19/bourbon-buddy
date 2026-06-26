/**
 * Initial RSS source list (UI/UX feature spec §5a). Hardcoded for now; moving
 * this to Firebase Remote Config (so sources can change without a redeploy) is
 * an easy follow-up — read a JSON param here and fall back to this list.
 */
export interface RssSource {
  name: string;
  url: string;
}

export const RSS_SOURCES: RssSource[] = [
  { name: "Breaking Bourbon", url: "https://www.breakingbourbon.com/articles/feed" },
  { name: "The Bourbon Review", url: "https://gobourbon.com/feed" },
  { name: "The Whiskey Wash", url: "https://thewhiskeywash.com/feed" },
  { name: "Whisky Advocate", url: "https://whiskyadvocate.com/feed/?x=1" },
  { name: "Modern Thirst", url: "https://modernthirst.com/feed" },
  { name: "Fred Minnick", url: "https://fredminnick.com/news/feed" },
  { name: "The Spirits Business", url: "https://www.thespiritsbusiness.com/feed" },
  { name: "BourbonBlog", url: "https://bourbonblog.com/feed" },
  { name: "Bourbon Guy", url: "https://www.bourbonguy.com/blog?format=rss" },
  {
    name: "GlobeNewswire (bourbon)",
    url: "https://rss.globenewswire.com/en/search/tag/bourbon",
  },
];
