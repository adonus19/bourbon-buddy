import { Timestamp } from '@angular/fire/firestore';

import { FlavorProfile } from '../../models';
import {
  blendedProfileTags,
  consensusCount,
  marketingOnlyTags,
  orderTagsByWeight,
  profileSourceLabel,
  reviewMentions,
  tagWeight,
  tasterMentions,
} from './flavor-provenance';

const profile = (over: Partial<FlavorProfile> = {}): FlavorProfile => ({
  nose: ['Banana', 'Corn'],
  palate: ['Oak'],
  finish: [],
  source: 'ai',
  model: 'test',
  generatedAt: Timestamp.now(),
  ...over,
});

describe('tagWeight (weak corroborator)', () => {
  it('counts review mentions, plus half-weight corroborated claims', () => {
    const p = profile({
      tagCounts: { Banana: 2 },
      marketingTagCounts: { Banana: 1, Vanilla: 3 },
    });
    expect(tagWeight(p, 'Banana')).toBe(2.5);
  });

  it('gives marketing-only tags zero weight — claims alone earn nothing', () => {
    const p = profile({ marketingTagCounts: { Vanilla: 3 } });
    expect(tagWeight(p, 'Vanilla')).toBe(0);
  });

  it('is zero on legacy profiles without provenance', () => {
    expect(tagWeight(profile(), 'Banana')).toBe(0);
    expect(tagWeight(null, 'Banana')).toBe(0);
  });
});

describe('orderTagsByWeight', () => {
  it('sorts by weight descending, keeping stored order on ties', () => {
    const p = profile({
      tagCounts: { Corn: 3, Oak: 1 },
      marketingTagCounts: { Oak: 2 },
    });
    // Corn 3, Oak 1 + 2*0.5 = 2, Banana 0.
    expect(orderTagsByWeight(['Banana', 'Corn', 'Oak'], p)).toEqual([
      'Corn',
      'Oak',
      'Banana',
    ]);
    // Legacy profile: everything weight 0 → stored order preserved.
    expect(orderTagsByWeight(['Banana', 'Corn'], profile())).toEqual([
      'Banana',
      'Corn',
    ]);
  });
});

describe('reviewMentions', () => {
  it('reads the review count for the ×N badge', () => {
    const p = profile({ tagCounts: { Banana: 3 } });
    expect(reviewMentions(p, 'Banana')).toBe(3);
    expect(reviewMentions(p, 'Oak')).toBe(0);
    expect(reviewMentions(null, 'Oak')).toBe(0);
  });
});

describe('marketingOnlyTags', () => {
  it('lists claims absent from the arrays, most-claimed first', () => {
    const p = profile({
      marketingTagCounts: { Vanilla: 1, Cinnamon: 2, Banana: 5 },
    });
    // Banana is in the nose array → corroborated, not "marketing-only".
    expect(marketingOnlyTags(p)).toEqual(['Cinnamon', 'Vanilla']);
  });

  it('is empty without claims', () => {
    expect(marketingOnlyTags(profile())).toEqual([]);
    expect(marketingOnlyTags(null)).toEqual([]);
  });
});

describe('profileSourceLabel', () => {
  it('labels earned consensus vs an AI guess', () => {
    expect(profileSourceLabel(profile({ reviewCount: 1 }))).toBe(
      'Based on 1 review'
    );
    expect(profileSourceLabel(profile({ reviewCount: 3 }))).toBe(
      'Based on 3 reviews'
    );
    expect(profileSourceLabel(profile())).toBe('AI-suggested');
    expect(profileSourceLabel(null)).toBeNull();
  });

  it('leads with tasters when the community tier exists (BB-188)', () => {
    expect(profileSourceLabel(profile({ contributorCount: 1 }))).toBe(
      'AI-suggested' // below the floor → not surfaced as community
    );
    expect(profileSourceLabel(profile({ contributorCount: 4 }))).toBe(
      'Based on 4 tasters'
    );
    expect(
      profileSourceLabel(profile({ contributorCount: 4, reviewCount: 2 }))
    ).toBe('Based on 4 tasters · 2 reviews');
  });
});

describe('tasterMentions / consensusCount (BB-188)', () => {
  it('reads the distinct-user count', () => {
    const p = profile({ userTagCounts: { Banana: 3 } });
    expect(tasterMentions(p, 'Banana')).toBe(3);
    expect(tasterMentions(p, 'Oak')).toBe(0);
    expect(tasterMentions(null, 'Oak')).toBe(0);
  });

  it('consensusCount prefers tasters over reviews for the ×N badge', () => {
    const p = profile({ userTagCounts: { Banana: 3 }, tagCounts: { Banana: 2 } });
    expect(consensusCount(p, 'Banana')).toBe(3); // tasters win
    const reviewOnly = profile({ tagCounts: { Oak: 2 } });
    expect(consensusCount(reviewOnly, 'Oak')).toBe(2);
  });
});

describe('orderTagsByWeight — community tier tops reviews (BB-188)', () => {
  it('ranks any community-confirmed tag above any review-only tag', () => {
    const p = profile({
      userTagCounts: { Oak: 2 }, // community
      tagCounts: { Corn: 5 }, // heavily reviewed but no tasters
    });
    expect(orderTagsByWeight(['Corn', 'Oak', 'Banana'], p)).toEqual([
      'Oak', // community tier wins despite Corn's 5 reviews
      'Corn',
      'Banana',
    ]);
  });
});

describe('blendedProfileTags (BB-188)', () => {
  it('unions community userTags over the arrays, community first, capped at 6', () => {
    const p = profile({
      nose: ['Vanilla'],
      palate: ['Corn'],
      finish: [],
      userTags: { nose: ['Oak'], palate: ['Corn'], finish: ['Char'] },
    });
    const blended = blendedProfileTags(p);
    expect(blended.nose).toEqual(['Oak', 'Vanilla']);
    expect(blended.palate).toEqual(['Corn']); // deduped
    expect(blended.finish).toEqual(['Char']);
  });

  it('equals the raw arrays with no community tier', () => {
    const p = profile();
    expect(blendedProfileTags(p)).toEqual({
      nose: p.nose,
      palate: p.palate,
      finish: p.finish,
    });
    expect(blendedProfileTags(null)).toEqual({ nose: [], palate: [], finish: [] });
  });
});
