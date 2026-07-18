import { FlavorProfile } from '../../models';

/**
 * Flavor tag provenance display logic (BB-222 + BB-188).
 *
 * The trust ladder (top → bottom): community-confirmed tags (`userTagCounts`,
 * BB-188) > review/listicle mentions (`tagCounts`) > AI suggestions (in the
 * arrays, uncounted) > producer claims (`marketingTagCounts`, display-only weak
 * CORROBORATOR). A marketing-only tag never joins the arrays; the community tier
 * always sorts first. Pure functions; safe in computed().
 *
 * `blendedProfileTags` mirrors the server helper of the same name
 * (`functions/src/ai/flavor-enrichment.ts`) — keep the two in step so client
 * prefill/display and server similarity agree on the effective tag set.
 */

/** How much a corroborating producer claim counts vs a review mention. */
const MARKETING_CORROBORATION_WEIGHT = 0.5;

/** Tags per stage; mirrors the server MAX_TAGS_PER_STAGE cap. */
const MAX_TAGS_PER_STAGE = 6;

/** Distinct users who confirmed a tag (BB-188) — the ×N badge's top signal. */
export function tasterMentions(
  profile: FlavorProfile | null | undefined,
  tag: string
): number {
  return profile?.userTagCounts?.[tag] ?? 0;
}

/**
 * The consensus count to badge (×N): community tasters take precedence over
 * review mentions, so a tag that real drinkers confirmed reads as drinker
 * consensus, not critic consensus.
 */
export function consensusCount(
  profile: FlavorProfile | null | undefined,
  tag: string
): number {
  return tasterMentions(profile, tag) || reviewMentions(profile, tag);
}

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

/**
 * Stable order: community tier first (any confirmed tag outranks any review-only
 * tag), then corroborated review weight, then stored order. Lexicographic so the
 * top tier strictly dominates regardless of how many reviews a lower tag has.
 */
export function orderTagsByWeight(
  tags: string[],
  profile: FlavorProfile | null | undefined
): string[] {
  return tags
    .map((tag, i) => ({
      tag,
      i,
      u: tasterMentions(profile, tag),
      w: tagWeight(profile, tag),
    }))
    .sort((a, b) => b.u - a.u || b.w - a.w || a.i - b.i)
    .map((x) => x.tag);
}

/**
 * Effective tags for prefill/display: the review/AI arrays with the community
 * tier unioned in, community-first so it fills the per-stage cap first. Mirror
 * of the server `blendedProfileTags`.
 */
export function blendedProfileTags(
  profile: FlavorProfile | null | undefined
): { nose: string[]; palate: string[]; finish: string[] } {
  const stage = (
    arr: string[] | undefined,
    user: string[] | undefined
  ): string[] =>
    [...new Set([...(user ?? []), ...(arr ?? [])])].slice(0, MAX_TAGS_PER_STAGE);
  return {
    nose: stage(profile?.nose, profile?.userTags?.nose),
    palate: stage(profile?.palate, profile?.userTags?.palate),
    finish: stage(profile?.finish, profile?.userTags?.finish),
  };
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

/** Distinct contributors required before the community tier is surfaced (BB-188). */
const COMMUNITY_FLOOR = 2;

/**
 * Honest source line, top tier first: community tasters (BB-188) over reviews
 * over an AI guess. When both tasters and reviews exist, both are credited.
 */
export function profileSourceLabel(
  profile: FlavorProfile | null | undefined
): string | null {
  if (!profile) {
    return null;
  }
  const tasters = profile.contributorCount ?? 0;
  const reviews = profile.reviewCount ?? 0;
  const reviewClause = reviews > 0
    ? ` · ${reviews} ${reviews === 1 ? 'review' : 'reviews'}`
    : '';
  if (tasters >= COMMUNITY_FLOOR) {
    return `Based on ${tasters} tasters${reviewClause}`;
  }
  if (reviews > 0) {
    return reviews === 1 ? 'Based on 1 review' : `Based on ${reviews} reviews`;
  }
  return 'AI-suggested';
}
