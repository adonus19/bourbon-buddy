import { ContextualTip } from './onboarding.types';

/**
 * Just-in-time tips (Pass 2). Each fires at most once per device, the first
 * time the user lands on the surface where the feature becomes relevant —
 * keeping the guided tour short while still teaching the deep features.
 *
 * A tip with an `anchor` that isn't on screen when it fires is skipped WITHOUT
 * being marked seen (see `OnboardingService.showTipOnce`), so it will try again
 * on a later visit once the feature is actually visible (e.g. an article with
 * extracted bottles, or a Cellar that finally has a single barrel).
 */
export const TIPS = {
  /** Bottle detail — the history roll-up + Buy Again shortcut. */
  bottleHistory: {
    key: 'bottle-history',
    anchor: 'detail-history',
    placement: 'top',
    title: 'The whole run',
    body: 'Every time you log this bottle it stacks up here — price trend, average rating, and a Buy Again shortcut for when you restock.',
  },
  /** Bottle detail (purchased) — pours, fill level, and the Graveyard. */
  pours: {
    key: 'pours',
    anchor: 'detail-pours',
    placement: 'top',
    title: 'Track it to the last drop',
    body: 'Log each dram as you pour it and set the fill level. When the bottle is empty, kill it — it moves to the Graveyard, kept forever.',
  },
  /** Bottle detail (single barrel) — barrel-to-barrel variance. */
  barrelVariance: {
    key: 'barrel-variance',
    anchor: 'detail-history',
    placement: 'top',
    title: 'No two barrels are alike',
    body: 'Single barrels vary bottle to bottle. Log a few and we will compare them side by side and crown your favorite pick.',
  },
  /** Dispatch — AI-extracted bottles from an article. */
  aiFinds: {
    key: 'ai-finds',
    anchor: 'dispatch-ai',
    placement: 'auto',
    title: 'Let the robot read for you',
    body: 'We pull the bottles worth chasing out of each story so you can drop them straight onto your Hunt List. No skimming required.',
  },
  /** Friends — the sightings map + taste matches. */
  social: {
    key: 'social',
    anchor: 'social-map',
    placement: 'bottom',
    title: 'Better with friends',
    body: 'See where friends spotted bottles on the map, and spot finds matched to your taste. Share a sighting and the right person gets pinged.',
  },
  /** The Numbers — the Year in Review. */
  yearReview: {
    key: 'year-review',
    anchor: 'numbers-year',
    placement: 'bottom',
    title: 'Your year in bourbon',
    body: 'Your standouts, your spend, your palate — the whole year rolled into one scroll. It gets better the more you log.',
  },
} satisfies Record<string, ContextualTip>;
