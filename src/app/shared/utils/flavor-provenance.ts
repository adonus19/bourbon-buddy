import { FlavorProfile } from '../../models';

/**
 * Flavor tag provenance display logic (BB-222).
 *
 * The trust ladder: review/listicle mentions (`tagCounts`) are load-bearing;
 * producer claims (`marketingTagCounts`) are display-only and act as a WEAK
 * CORROBORATOR — they add ordering weight to a tag a review already mentions,
 * but a marketing-only tag never joins the profile arrays and never feeds
 * Taste Match / Similar Bottles. Pure functions; safe in computed().
 */

/** How much a corroborating producer claim counts vs a review mention. */
const MARKETING_CORROBORATION_WEIGHT = 0.5;

/** Review/listicle mentions of a tag (drives the ×N badge at N ≥ 2). */
export function reviewMentions(
  profile: FlavorProfile | null | undefined,
  tag: string
): number {
  return profile?.tagCounts?.[tag] ?? 0;
}

/**
 * Display weight for ordering: review mentions, plus half-weight marketing
 * corroboration — but only when at least one review already mentions the tag.
 */
export function tagWeight(
  profile: FlavorProfile | null | undefined,
  tag: string
): number {
  const reviews = reviewMentions(profile, tag);
  if (reviews === 0) {
    return 0;
  }
  const claims = profile?.marketingTagCounts?.[tag] ?? 0;
  return reviews + claims * MARKETING_CORROBORATION_WEIGHT;
}

/** Stable weight-descending order; uncounted tags keep their stored order. */
export function orderTagsByWeight(
  tags: string[],
  profile: FlavorProfile | null | undefined
): string[] {
  return tags
    .map((tag, i) => ({ tag, i, w: tagWeight(profile, tag) }))
    .sort((a, b) => b.w - a.w || a.i - b.i)
    .map((x) => x.tag);
}

/**
 * Producer claims that no review corroborates and that aren't in the profile
 * arrays — the "Distillery says …" row, most-claimed first.
 */
export function marketingOnlyTags(
  profile: FlavorProfile | null | undefined
): string[] {
  const claims = profile?.marketingTagCounts;
  if (!claims) {
    return [];
  }
  const inArrays = new Set([
    ...(profile?.nose ?? []),
    ...(profile?.palate ?? []),
    ...(profile?.finish ?? []),
  ]);
  return Object.entries(claims)
    .filter(([tag]) => !inArrays.has(tag))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag);
}

/** Honest source line: earned consensus vs an AI guess. */
export function profileSourceLabel(
  profile: FlavorProfile | null | undefined
): string | null {
  if (!profile) {
    return null;
  }
  const n = profile.reviewCount ?? 0;
  if (n > 0) {
    return n === 1 ? 'Based on 1 review' : `Based on ${n} reviews`;
  }
  return 'AI-suggested';
}
