import { TourStep } from './onboarding.types';

/**
 * The guided walkthrough script (BB — first-run tour).
 *
 * Coverage is "core loop + marquee extras" in the app's deadpan voice. Steps
 * are anchored to always-present shell elements (tab buttons, page FABs) where
 * possible; concepts that need an existing record to point at (Value Score,
 * Unicorn tier) are taught with centered cards instead, so the tour works even
 * on a brand-new, empty account.
 *
 * Anchor keys here must match a `bbTourAnchor="<key>"` in the corresponding
 * template. A step whose anchor never registers (see `requiresAnchor`) is
 * skipped rather than blocking the tour.
 */
export const TOUR_ANCHORS = {
  tabCellar: 'tab-cellar',
  cellarFab: 'cellar-fab',
  cellarSegment: 'cellar-segment',
  tabHunt: 'tab-hunt',
  huntFab: 'hunt-fab',
  tabDispatch: 'tab-dispatch',
  tabNumbers: 'tab-numbers',
  tabSocial: 'tab-social',
} as const;

export const GUIDED_TOUR: readonly TourStep[] = [
  {
    id: 'welcome',
    placement: 'center',
    title: 'Welcome to Bourbon Buddy',
    body: 'Five rooms in this bar, and a couple of tricks worth knowing. Give me two minutes and then you are on your own.',
  },
  {
    id: 'cellar',
    route: '/tabs/cellar',
    anchor: TOUR_ANCHORS.tabCellar,
    placement: 'top',
    title: 'This is your Cellar',
    body: 'Every bottle you have tried lives here — tasting notes, ratings, the works. It is the heart of the whole thing.',
  },
  {
    id: 'cellar-fab',
    route: '/tabs/cellar',
    anchor: TOUR_ANCHORS.cellarFab,
    placement: 'top',
    title: 'Add a bottle',
    body: 'Tap the plus to log a new pour or report a sighting. It is the one button you will use the most.',
  },
  {
    id: 'cellar-segments',
    route: '/tabs/cellar',
    anchor: TOUR_ANCHORS.cellarSegment,
    placement: 'bottom',
    requiresAnchor: true,
    title: 'Shelf, Journal, Graveyard',
    body: 'Open bottles sit on the Shelf. Bottles you have killed go to the Graveyard. Pour one out.',
  },
  {
    id: 'value-score',
    route: '/tabs/cellar',
    placement: 'center',
    title: 'We do the math',
    body: 'Rate a bottle and log its price and we work out a Value Score — rating per dollar. A high score means it punches above its weight.',
  },
  {
    id: 'hunt-list',
    route: '/tabs/hunt-list',
    anchor: TOUR_ANCHORS.tabHunt,
    placement: 'top',
    title: 'The Hunt List',
    body: 'Bottles you want but have not caught yet. Track priority, MSRP, and the best price anyone has spotted.',
  },
  {
    id: 'sightings',
    route: '/tabs/hunt-list',
    anchor: TOUR_ANCHORS.huntFab,
    placement: 'top',
    title: 'Report a sighting',
    body: 'Spot a bottle in the wild? Log where and how much. People are going to believe you.',
  },
  {
    id: 'unicorns',
    route: '/tabs/hunt-list',
    placement: 'center',
    title: 'Mark your Unicorns',
    body: 'Flag the white whales as Grail tier. When you finally land one, we will make an appropriate amount of fuss.',
  },
  {
    id: 'dispatch',
    route: '/tabs/dispatch',
    anchor: TOUR_ANCHORS.tabDispatch,
    placement: 'top',
    title: 'The Dispatch',
    body: 'Bourbon news, curated. Save what matters, dismiss what does not, and let the AI pull bottles worth hunting.',
  },
  {
    id: 'numbers',
    route: '/tabs/numbers',
    anchor: TOUR_ANCHORS.tabNumbers,
    placement: 'top',
    title: 'The Numbers',
    body: 'Your palate, your spend, your favorite distilleries — plus a Year in Review when you have logged enough. All the receipts.',
  },
  {
    id: 'friends',
    route: '/tabs/social',
    anchor: TOUR_ANCHORS.tabSocial,
    placement: 'top',
    title: 'Your circle',
    body: 'Share sightings with friends and get pinged the moment someone spots a bottle on your Hunt List.',
  },
  {
    id: 'outro',
    placement: 'center',
    title: 'That is the place',
    body: 'The rest you will pick up as you go. Now go pour one.',
  },
];
