import { friendErrorMessage } from './friend-error';

describe('friendErrorMessage', () => {
  it('maps known callable codes to friendly copy', () => {
    expect(friendErrorMessage({ code: 'resource-exhausted' })).toContain(
      'lot of requests'
    );
    expect(friendErrorMessage({ code: 'functions/already-exists' })).toContain(
      'already'
    );
    expect(friendErrorMessage({ code: 'permission-denied' })).toContain(
      "can't send"
    );
    expect(friendErrorMessage({ code: 'not-found' })).toContain(
      'no longer available'
    );
    expect(friendErrorMessage({ code: 'invalid-argument' })).toContain('off');
  });

  it('prefers a provided message over the default', () => {
    expect(
      friendErrorMessage({ code: 'not-found', message: 'Custom text' })
    ).toBe('Custom text');
  });

  it('falls back for unknown/absent codes', () => {
    expect(friendErrorMessage({ code: 'weird' })).toBe(
      "Couldn't complete that. Try again."
    );
    expect(friendErrorMessage(null)).toBe("Couldn't complete that. Try again.");
    expect(friendErrorMessage(undefined)).toBe(
      "Couldn't complete that. Try again."
    );
  });
});
