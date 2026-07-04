import { NewsArticle } from '../../models';
import { DEFAULT_NEWS_PREFS, isWatched, passesPrefs } from './news-filter';

function article(over: Partial<NewsArticle> = {}): NewsArticle {
  return {
    headline: 'New Buffalo Trace release',
    excerpt: 'A limited bottling arrives this fall.',
    categories: ['release'],
    ...over,
  } as NewsArticle;
}

describe('passesPrefs', () => {
  it('keeps an article whose category is active', () => {
    const prefs = { ...DEFAULT_NEWS_PREFS, activeCategories: ['release'] };
    expect(passesPrefs(article(), prefs)).toBe(true);
  });

  it('drops an article with no active-category overlap', () => {
    const prefs = { ...DEFAULT_NEWS_PREFS, activeCategories: ['award'] };
    expect(passesPrefs(article({ categories: ['release'] }), prefs)).toBe(false);
  });

  it('keeps everything when no categories are active', () => {
    const prefs = { ...DEFAULT_NEWS_PREFS, activeCategories: [] };
    expect(passesPrefs(article({ categories: ['event'] }), prefs)).toBe(true);
  });

  it('drops an article matching an exclude keyword (case-insensitive)', () => {
    const prefs = {
      ...DEFAULT_NEWS_PREFS,
      activeCategories: [],
      excludeKeywords: ['BUFFALO'],
    };
    expect(passesPrefs(article(), prefs)).toBe(false);
  });
});

describe('isWatched', () => {
  it('matches a watch keyword or distillery in headline/excerpt', () => {
    expect(
      isWatched(article(), {
        ...DEFAULT_NEWS_PREFS,
        watchKeywords: ['limited'],
      })
    ).toBe(true);
    expect(
      isWatched(article(), {
        ...DEFAULT_NEWS_PREFS,
        watchDistilleries: ['buffalo trace'],
      })
    ).toBe(true);
  });

  it('is false when nothing matches', () => {
    expect(
      isWatched(article(), { ...DEFAULT_NEWS_PREFS, watchKeywords: ['scotch'] })
    ).toBe(false);
  });

  it('handles a null excerpt', () => {
    expect(
      isWatched(article({ excerpt: null }), {
        ...DEFAULT_NEWS_PREFS,
        watchKeywords: ['buffalo'],
      })
    ).toBe(true);
  });
});
