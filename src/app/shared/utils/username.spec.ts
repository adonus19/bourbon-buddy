import {
  USERNAME_MAX,
  USERNAME_MIN,
  usernameKey,
  validateUsername,
} from './username';

describe('usernameKey', () => {
  it('lowercases and trims', () => {
    expect(usernameKey('  BourbonFan_99 ')).toBe('bourbonfan_99');
  });
});

describe('validateUsername', () => {
  it('accepts a valid handle', () => {
    expect(validateUsername('bourbon_fan99')).toBeNull();
  });

  it('rejects too short / too long', () => {
    expect(validateUsername('ab')).toContain(`${USERNAME_MIN}`);
    expect(validateUsername('a'.repeat(USERNAME_MAX + 1))).toContain(
      `${USERNAME_MAX}`
    );
  });

  it('rejects disallowed characters', () => {
    expect(validateUsername('has space')).toBe(
      'Use only letters, numbers, and underscores.'
    );
    expect(validateUsername('dots.no')).not.toBeNull();
    expect(validateUsername('emoji🥃here')).not.toBeNull();
  });

  it('validates against the trimmed value', () => {
    expect(validateUsername('  ab  ')).not.toBeNull(); // trims to 2 chars
    expect(validateUsername('  good_name  ')).toBeNull();
  });
});
