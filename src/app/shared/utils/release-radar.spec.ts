import { Timestamp } from '@angular/fire/firestore';

import { MentionedBottle, NewsArticle } from '../../models';
import { releaseRadar } from './release-radar';

const DAY = 24 * 60 * 60 * 1000;
const BASE = 1_700_000_000_000;

function ts(ms: number): Timestamp {
  return { toMillis: () => ms } as unknown as Timestamp;
}

function art(
  id: string,
  daysAgo: number,
  bottles: MentionedBottle[],
  over: Partial<NewsArticle> = {}
): NewsArticle {
  const ms = BASE - daysAgo * DAY;
  return {
    id,
    sourceName: 'Breaking Bourbon',
    headline: `Headline ${id}`,
    url: `https://example.com/${id}`,
    fetchedAt: ts(ms),
    publishedAt: ts(ms),
    categories: [],
    keywords: [],
    mentionedBottles: bottles,
    ...over,
  };
}

function bot(name: string, over: Partial<MentionedBottle> = {}): MentionedBottle {
  return { name, ...over };
}

describe('releaseRadar', () => {
  it('returns [] for no articles or articles without bottles', () => {
    expect(releaseRadar([])).toEqual([]);
    expect(releaseRadar([art('a', 1, []), art('b', 2, undefined as never)])).toEqual(
      []
    );
  });

  it('dedupes a bottle across articles by bourbonId, tracking first/last seen and count', () => {
    const radar = releaseRadar([
      art('a', 2, [bot('Weller 12', { bourbonId: 'w12' })]),
      art('b', 5, [bot('Weller 12 Year', { bourbonId: 'w12' })]),
      art('c', 8, [bot('Weller 12', { bourbonId: 'w12' })]),
    ]);
    expect(radar).toHaveLength(1);
    const r = radar[0];
    expect(r.key).toBe('w12');
    expect(r.articleCount).toBe(3);
    expect(r.firstSeen).toBe(BASE - 8 * DAY); // earliest
    expect(r.latest).toBe(BASE - 2 * DAY); // most recent
    expect(r.bottle.name).toBe('Weller 12'); // freshest as-written name (2 days ago)
    expect(r.articles.map((a) => a.id)).toEqual(['a', 'b', 'c']); // newest first
  });

  it('dedupes by normalized name when there is no bourbonId', () => {
    const radar = releaseRadar([
      art('a', 1, [bot('Mystery Batch')]),
      art('b', 3, [bot('  mystery batch ')]),
    ]);
    expect(radar).toHaveLength(1);
    expect(radar[0].key).toBe('mystery batch');
    expect(radar[0].articleCount).toBe(2);
  });

  it('sorts by firstSeen descending — newly surfaced bottles lead', () => {
    const radar = releaseRadar([
      art('old', 30, [bot('Old Timer', { bourbonId: 'old' })]),
      art('new', 1, [bot('Fresh Drop', { bourbonId: 'new' })]),
      art('mid', 10, [bot('Middle', { bourbonId: 'mid' })]),
    ]);
    expect(radar.map((r) => r.key)).toEqual(['new', 'mid', 'old']);
  });

  it('backfills distillery / category / flavor from any mention, keeping the freshest name', () => {
    const radar = releaseRadar([
      // newest: bare mention (name only)
      art('a', 1, [bot('Stagg', { bourbonId: 's' })]),
      // older: richer mention
      art('b', 6, [
        bot('George T. Stagg', {
          bourbonId: 's',
          distillery: 'Buffalo Trace',
          category: 'bourbon',
          flavor: { nose: ['vanilla'], palate: [], finish: [] },
        }),
      ]),
    ]);
    const b = radar[0].bottle;
    expect(b.name).toBe('Stagg'); // freshest
    expect(b.distillery).toBe('Buffalo Trace'); // backfilled
    expect(b.category).toBe('bourbon');
    expect(b.flavor?.nose).toEqual(['vanilla']);
  });

  it('skips blank-named mentions', () => {
    const radar = releaseRadar([art('a', 1, [bot('   '), bot('Real', { bourbonId: 'r' })])]);
    expect(radar.map((r) => r.key)).toEqual(['r']);
  });

  it('uses fetchedAt when publishedAt is absent', () => {
    const ms = BASE - 4 * DAY;
    const a: NewsArticle = {
      ...art('a', 0, [bot('X', { bourbonId: 'x' })]),
      publishedAt: null,
      fetchedAt: ts(ms),
    };
    expect(releaseRadar([a])[0].firstSeen).toBe(ms);
  });
});
