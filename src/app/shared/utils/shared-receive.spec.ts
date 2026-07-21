import { cellarIntentPreset, isCellarIntent } from './shared-receive';

describe('cellarIntentPreset (BB-230c)', () => {
  it('shelf → owned + open (full bottle)', () => {
    expect(cellarIntentPreset('shelf')).toEqual({
      entryType: 'bottle_purchased',
      bottleRemainingPct: 100,
    });
  });

  it('graveyard → owned + empty (derives to finished)', () => {
    expect(cellarIntentPreset('graveyard')).toEqual({
      entryType: 'bottle_purchased',
      bottleRemainingPct: 0,
    });
  });

  it('journal → a drink, no bottle lifecycle', () => {
    expect(cellarIntentPreset('journal')).toEqual({
      entryType: 'drink',
      bottleRemainingPct: null,
    });
  });

  it('guards intent values', () => {
    expect(isCellarIntent('shelf')).toBe(true);
    expect(isCellarIntent('got_away')).toBe(false);
    expect(isCellarIntent(undefined)).toBe(false);
  });
});
