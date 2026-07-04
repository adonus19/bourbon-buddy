import { sightingErrorMessage } from './sighting-error';

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
