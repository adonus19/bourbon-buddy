import {
  isRetryableSightingError,
  sightingErrorMessage,
} from './sighting-error';

describe('sightingErrorMessage', () => {
  it('maps rate-limit and validation codes', () => {
    expect(sightingErrorMessage({ code: 'resource-exhausted' })).toContain(
      'Daily sighting limit'
    );
    expect(sightingErrorMessage({ code: 'invalid-argument' })).toContain(
      'looks off'
    );
  });

  it('prefers a provided message', () => {
    expect(
      sightingErrorMessage({ code: 'resource-exhausted', message: 'Slow down' })
    ).toBe('Slow down');
  });

  it('falls back for unknown/absent codes', () => {
    expect(sightingErrorMessage({})).toBe(
      "Couldn't save the sighting. Try again."
    );
    expect(sightingErrorMessage(null)).toBe(
      "Couldn't save the sighting. Try again."
    );
  });
});

describe('isRetryableSightingError (BB-182)', () => {
  it('treats permanent, content-based rejections as non-retryable', () => {
    for (const code of [
      'functions/invalid-argument',
      'functions/resource-exhausted',
      'permission-denied',
      'failed-precondition',
      'not-found',
    ]) {
      expect(isRetryableSightingError({ code })).toBe(false);
    }
  });

  it('treats offline/transient/unknown errors as retryable', () => {
    expect(isRetryableSightingError({ code: 'functions/unavailable' })).toBe(true);
    expect(isRetryableSightingError({ code: 'internal' })).toBe(true);
    expect(isRetryableSightingError(new Error('network'))).toBe(true);
    expect(isRetryableSightingError(null)).toBe(true);
  });
});
