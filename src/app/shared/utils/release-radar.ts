import { MentionedBottle, NewsArticle } from '../../models';

/**
 * Release Radar derivation (BB-207). Pure, testable reduction over the
 * already-loaded news articles — no Firestore, no clock. Flattens each article's
 * cached `mentionedBottles` (BB-130), dedupes to one row per bottle, records when
 * it was first and last seen plus its source articles, and sorts so the most
 * recently *first-surfaced* bottles lead (newly appearing bottles bubble up).
 *
 * This is discovery, not a release feed: "spotted in the news," never "released."
 */
export interface RadarBottle {
  /** Dedupe key: catalog id when known, else the normalized name. */
  key: string;
  /** Merged representative mention (freshest name; details backfilled). */
  bottle: MentionedBottle;
  /** Millis of the earliest article mentioning it. */
  firstSeen: number;
  /** Millis of the most recent article mentioning it. */
  latest: number;
  /** Distinct articles mentioning it. */
  articleCount: number;
  /** Those articles, newest first (source + timing for the card). */
  articles: NewsArticle[];
}

interface Entry {
  bottle: MentionedBottle;
  article: NewsArticle;
  when: number;
}

/** An article's timeline position: its published date, or fetch date as fallback. */
function articleMillis(a: NewsArticle): number {
  return (a.publishedAt ?? a.fetchedAt)?.toMillis() ?? 0;
}

function bottleKey(b: MentionedBottle): string {
  return b.bourbonId || b.name.trim().toLowerCase();
}

function hasFlavor(
  f?: { nose: string[]; palate: string[]; finish: string[] } | null
): boolean {
  return !!f && f.nose.length + f.palate.length + f.finish.length > 0;
}

export function releaseRadar(articles: NewsArticle[]): RadarBottle[] {
  const groups = new Map<string, Entry[]>();
  for (const article of articles) {
    const when = articleMillis(article);
    for (const bottle of article.mentionedBottles ?? []) {
      if (!bottle?.name?.trim()) {
        continue;
      }
      const key = bottleKey(bottle);
      const entry: Entry = { bottle, article, when };
      const list = groups.get(key);
      if (list) {
        list.push(entry);
      } else {
        groups.set(key, [entry]);
      }
    }
  }

  const radar: RadarBottle[] = [];
  for (const [key, entries] of groups) {
    const byNewest = [...entries].sort((a, b) => b.when - a.when);
    const firstSeen = Math.min(...entries.map((e) => e.when));

    // Distinct source articles, newest first.
    const seen = new Set<string>();
    const articlesNewestFirst: NewsArticle[] = [];
    for (const e of byNewest) {
      const id = e.article.id ?? e.article.url;
      if (!seen.has(id)) {
        seen.add(id);
        articlesNewestFirst.push(e.article);
      }
    }

    radar.push({
      key,
      bottle: mergeMentions(byNewest.map((e) => e.bottle)),
      firstSeen,
      latest: byNewest[0].when,
      articleCount: articlesNewestFirst.length,
      articles: articlesNewestFirst,
    });
  }

  return radar.sort((a, b) => b.firstSeen - a.firstSeen);
}

/**
 * Drops radar bottles the user already tracks (BB-209): anything whose catalog
 * id is in `trackedIds` (their Cellar + active Hunt List). Bottles not yet in the
 * catalog (no bourbonId) are always kept — they can't be "already tracked".
 */
export function withoutTracked(
  radar: RadarBottle[],
  trackedIds: Set<string>
): RadarBottle[] {
  return radar.filter(
    (r) => !r.bottle.bourbonId || !trackedIds.has(r.bottle.bourbonId)
  );
}

/**
 * The representative mention: the newest article's name (freshest as-written),
 * with id / distillery / category / flavor backfilled from any mention that has
 * them — so a later bare mention never drops details an earlier one carried.
 */
function mergeMentions(byNewest: MentionedBottle[]): MentionedBottle {
  const base = byNewest[0];
  return {
    name: base.name,
    bourbonId: base.bourbonId ?? byNewest.find((m) => m.bourbonId)?.bourbonId ?? null,
    distillery:
      base.distillery ?? byNewest.find((m) => m.distillery)?.distillery ?? null,
    category: base.category ?? byNewest.find((m) => m.category)?.category ?? null,
    flavor: byNewest.find((m) => hasFlavor(m.flavor))?.flavor ?? base.flavor ?? null,
  };
}
