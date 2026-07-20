import {
  DEFAULT_SPEND_PRIVACY,
  MASKED_SPEND,
  displaySpend,
  isSpendHidden,
  spendPrivacyOf,
} from './spend-privacy';

describe('spendPrivacyOf', () => {
  it('defaults to visible for a profile that has never set it', () => {
    // Every existing user predates this feature, so absence must mean "show it".
    expect(spendPrivacyOf(undefined)).toEqual(DEFAULT_SPEND_PRIVACY);
    expect(spendPrivacyOf({})).toEqual(DEFAULT_SPEND_PRIVACY);
    expect(DEFAULT_SPEND_PRIVACY.hidden).toBe(false);
  });

  it('fills missing fields rather than trusting a partial document', () => {
    // A doc written by an older build may carry only `hidden`.
    const p = spendPrivacyOf({ spendPrivacy: { hidden: true } });
    expect(p.hidden).toBe(true);
    expect(p.mode).toBe(DEFAULT_SPEND_PRIVACY.mode);
    expect(p.gauntletRuns).toBe(DEFAULT_SPEND_PRIVACY.gauntletRuns);
    expect(p.configured).toBe(false);
  });

  it('preserves a fully specified setting', () => {
    const p = spendPrivacyOf({
      spendPrivacy: {
        hidden: true,
        mode: 'self',
        gauntletRuns: 3,
        configured: true,
      },
    });
    expect(p).toMatchObject({
      hidden: true,
      mode: 'self',
      gauntletRuns: 3,
      configured: true,
    });
  });

  it('rejects an unknown mode instead of passing it through', () => {
    const p = spendPrivacyOf({
      spendPrivacy: { hidden: true, mode: 'nonsense' as never },
    });
    expect(p.mode).toBe(DEFAULT_SPEND_PRIVACY.mode);
  });

  it('floors a negative or fractional run count', () => {
    // The counter only ever grows; a nonsense value must not break the ladder.
    expect(spendPrivacyOf({ spendPrivacy: { gauntletRuns: -4 } }).gauntletRuns)
      .toBe(0);
    expect(spendPrivacyOf({ spendPrivacy: { gauntletRuns: 2.7 } }).gauntletRuns)
      .toBe(2);
  });
});

describe('isSpendHidden', () => {
  it('is false when not hidden, regardless of session reveal', () => {
    expect(isSpendHidden(spendPrivacyOf({}), false)).toBe(false);
    expect(isSpendHidden(spendPrivacyOf({}), true)).toBe(false);
  });

  it('is true when hidden and not revealed this session', () => {
    const p = spendPrivacyOf({ spendPrivacy: { hidden: true } });
    expect(isSpendHidden(p, false)).toBe(true);
  });

  it('is false when hidden but revealed for this session', () => {
    // Revealing is session-only — it must never flip the stored setting.
    const p = spendPrivacyOf({ spendPrivacy: { hidden: true } });
    expect(isSpendHidden(p, true)).toBe(false);
  });
});

describe('displaySpend', () => {
  it('shows the real amount when not hidden', () => {
    expect(displaySpend('$1,240', spendPrivacyOf({}), false)).toBe('$1,240');
  });

  it('masks the amount when hidden', () => {
    const p = spendPrivacyOf({ spendPrivacy: { hidden: true } });
    expect(displaySpend('$1,240', p, false)).toBe(MASKED_SPEND);
  });

  it('masks with a plain dash, never a lock or a digit count', () => {
    // A conspicuous "LOCKED" badge is worse than the number for the partner
    // case — it advertises that something is being hidden. And any mask that
    // preserves length leaks the magnitude.
    expect(MASKED_SPEND).toBe('—');
    const p = spendPrivacyOf({ spendPrivacy: { hidden: true } });
    expect(displaySpend('$12', p, false)).toBe(displaySpend('$999,999', p, false));
  });

  it('shows the amount again once revealed this session', () => {
    const p = spendPrivacyOf({ spendPrivacy: { hidden: true } });
    expect(displaySpend('$1,240', p, true)).toBe('$1,240');
  });
});
