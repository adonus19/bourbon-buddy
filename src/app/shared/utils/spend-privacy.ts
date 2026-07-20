import { SpendPrivacy, SpendPrivacyMode, UserProfile } from '../../models';

/**
 * Discreet Total Spent (BB-229). Pure helpers over the stored setting — no
 * Firestore, no Angular, so the rules are testable on their own.
 *
 * Scope is deliberately the **Total Spent tile only** (owner decision
 * 2026-07-20). Value Score, the spend charts, and per-entry prices stay visible
 * and can be used to back into the number; that tradeoff was accepted. The
 * masking is expressed as `displaySpend(value, …)` rather than inlined in the
 * template so widening the scope later is a change here, not a refactor.
 */

/** How the user wants hiding to behave (chosen in the BB-229b modal). */
export const SPEND_PRIVACY_MODES: SpendPrivacyMode[] = [
  'partner',
  'self',
  'plain',
];

/** Highest gauntlet rung (BB-229c). */
export const MAX_GAUNTLET_TIER = 7;

/**
 * What a masked amount renders as. A plain em dash on purpose: a "🔒 HIDDEN"
 * badge would be *more* conspicuous than the number it replaces, which defeats
 * the partner case entirely. It is also fixed-width regardless of the real
 * value, so the mask never leaks magnitude.
 */
export const MASKED_SPEND = '—';

export const DEFAULT_SPEND_PRIVACY: SpendPrivacy = {
  hidden: false,
  mode: 'plain',
  tier: 0,
  configured: false,
};

/**
 * The effective setting for a profile, with defaults filled in. Absence means
 * "visible" — every account predates this feature, so nothing is hidden until
 * the user asks for it.
 */
export function spendPrivacyOf(
  profile: Partial<UserProfile> | undefined | null
): SpendPrivacy {
  const stored = profile?.spendPrivacy;
  if (!stored) {
    return { ...DEFAULT_SPEND_PRIVACY };
  }
  return {
    hidden: stored.hidden ?? DEFAULT_SPEND_PRIVACY.hidden,
    mode: SPEND_PRIVACY_MODES.includes(stored.mode as SpendPrivacyMode)
      ? (stored.mode as SpendPrivacyMode)
      : DEFAULT_SPEND_PRIVACY.mode,
    tier: clampTier(stored.tier ?? DEFAULT_SPEND_PRIVACY.tier),
    configured: stored.configured ?? DEFAULT_SPEND_PRIVACY.configured,
  };
}

/** Keeps a stored tier inside the ladder, whatever the document says. */
export function clampTier(tier: number): number {
  if (!Number.isFinite(tier)) {
    return 0;
  }
  return Math.min(MAX_GAUNTLET_TIER, Math.max(0, Math.trunc(tier)));
}

/**
 * Should the amount be masked right now? `revealedThisSession` is transient
 * page state — revealing shows the number for the visit without ever flipping
 * the stored `hidden` flag, so it re-hides on the next visit.
 */
export function isSpendHidden(
  privacy: SpendPrivacy,
  revealedThisSession: boolean
): boolean {
  return privacy.hidden && !revealedThisSession;
}

/** The string the Total Spent tile should render. */
export function displaySpend(
  value: string,
  privacy: SpendPrivacy,
  revealedThisSession: boolean
): string {
  return isSpendHidden(privacy, revealedThisSession) ? MASKED_SPEND : value;
}
