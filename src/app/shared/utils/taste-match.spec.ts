import {
  buildTasteVector,
  LIKE_RATING_MIN,
  matchTaste,
  MIN_LIKED_ENTRIES,
} from './taste-match';

type EntryLike = Parameters<typeof buildTasteVector>[0][number];

const entry = (
  rating: number | null,
  tags: Partial<Pick<EntryLike, 'noseTags' | 'palateTags' | 'finishTags'>> = {}
): EntryLike => ({
  rating,
  noseTags: [],
  palateTags: [],
  finishTags: [],
  ...tags,
});

const liked = (tags: Partial<Pick<EntryLike, 'noseTags' | 'palateTags' | 'finishTags'>>) =>
  entry(LIKE_RATING_MIN, tags);

describe('buildTasteVector (BB-199)', () => {
  it('returns null below the cold-start threshold', () => {
    const few = Array.from({ length: MIN_LIKED_ENTRIES - 1 }, () =>
      liked({ palateTags: ['Cherry'] })
    );
    expect(buildTasteVector(few)).toBeNull();
  });

  it('only high-rated, tagged entries feed the vector', () => {
    const entries = [
      liked({ palateTags: ['Cherry'] }),
      liked({ palateTags: ['Cherry'], noseTags: ['Vanilla'] }),
      liked({ palateTags: ['Oak'] }),
      entry(2.5, { palateTags: ['Smoke'] }), // disliked — ignored
      entry(5, {}), // loved but untagged — ignored
      entry(null, { palateTags: ['Peat'] }), // unrated — ignored
    ];
    const v = buildTasteVector(entries);
    expect(v).not.toBeNull();
    expect(v?.palate['Cherry']).toBe(2);
    expect(v?.palate['Oak']).toBe(1);
    expect(v?.nose['Vanilla']).toBe(1);
    expect(v?.palate['Smoke']).toBeUndefined();
    expect(v?.palate['Peat']).toBeUndefined();
    expect(v?.basedOnEntries).toBe(3);
  });
});

describe('matchTaste (BB-199)', () => {
  const vector = buildTasteVector([
    liked({ palateTags: ['Cherry', 'Rye Spice'], noseTags: ['Vanilla'] }),
    liked({ palateTags: ['Cherry'], finishTags: ['Oak'] }),
    liked({ palateTags: ['Rye Spice'], noseTags: ['Vanilla'] }),
  ])!;

  it('matches a bottle sharing a palate tag plus another stage', () => {
    const res = matchTaste(vector, {
      nose: ['Vanilla'],
      palate: ['Cherry'],
      finish: [],
    });
    expect(res.matched).toBe(true);
    expect(res.tags).toContain('Cherry');
    expect(res.tags).toContain('Vanilla');
  });

  it('does not match on a single shared tag', () => {
    const res = matchTaste(vector, { nose: [], palate: ['Cherry'], finish: [] });
    expect(res.matched).toBe(false);
  });

  it('does not match nose/finish-only overlap below the weighted floor', () => {
    // Vanilla (nose 1) + Oak (finish 1) = 2 < floor of 3.
    const res = matchTaste(vector, {
      nose: ['Vanilla'],
      palate: [],
      finish: ['Oak'],
    });
    expect(res.matched).toBe(false);
  });

  it('orders matched tags by how strongly the user likes them', () => {
    const res = matchTaste(vector, {
      nose: ['Vanilla'],
      palate: ['Cherry', 'Rye Spice'],
      finish: ['Oak'],
    });
    // Cherry (2) and Rye Spice (2) lead; single-occurrence tags follow.
    expect(res.tags.slice(0, 2).sort()).toEqual(['Cherry', 'Rye Spice']);
  });

  it('never matches with a null vector or empty profile', () => {
    expect(matchTaste(null, { nose: ['Vanilla'], palate: ['Cherry'], finish: [] }).matched).toBe(false);
    expect(matchTaste(vector, null).matched).toBe(false);
    expect(matchTaste(vector, { nose: [], palate: [], finish: [] }).matched).toBe(false);
  });
});
