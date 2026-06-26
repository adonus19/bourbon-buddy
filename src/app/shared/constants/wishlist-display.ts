import { WishlistPriority, WishlistStatus } from '../../models';

// Priority badge presentation. Grail is the "Unicorn" tier (distinctive purple);
// the others use stepped amber-dim shades. See docs/bourbon-buddy-ui-ux-brief.md.
export const PRIORITY_DISPLAY: Record<
  WishlistPriority,
  { label: string; badgeBg: string; badgeText: string; isGrail: boolean }
> = {
  grail: {
    label: 'Unicorn',
    badgeBg: 'var(--color-unicorn)',
    badgeText: '#ffffff',
    isGrail: true,
  },
  high: {
    label: 'High',
    badgeBg: 'rgba(138, 92, 40, 0.9)',
    badgeText: 'var(--color-amber-light)',
    isGrail: false,
  },
  normal: {
    label: 'Normal',
    badgeBg: 'rgba(138, 92, 40, 0.55)',
    badgeText: 'var(--color-text-secondary)',
    isGrail: false,
  },
  low: {
    label: 'Low',
    badgeBg: 'rgba(138, 92, 40, 0.3)',
    badgeText: 'var(--color-text-secondary)',
    isGrail: false,
  },
};

export const STATUS_DISPLAY: Record<WishlistStatus, string> = {
  actively_looking: 'Actively Looking',
  casually_looking: 'Casually Looking',
  just_browsing: 'Just Browsing',
  logged: 'Logged',
  got_away: 'Got Away',
};
