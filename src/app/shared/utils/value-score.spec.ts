import {
  VALUE_SCORE_PAR_PRICE,
  computeValueScore,
  valueScoreLabel,
} from './value-score';

describe('computeValueScore', () => {
  it('returns null when rating or price is missing/invalid', () => {
    expect(computeValueScore(null, 50)).toBeNull();
    expect(computeValueScore(4, null)).toBeNull();
    expect(computeValueScore(undefined, undefined)).toBeNull();
    expect(computeValueScore(4, 0)).toBeNull();
    expect(computeValueScore(4, -10)).toBeNull();
  });

  it('equals the rating percentage at par price', () => {
    expect(computeValueScore(5, VALUE_SCORE_PAR_PRICE)).toBe(100);
    expect(computeValueScore(4, VALUE_SCORE_PAR_PRICE)).toBe(80);
  });

  it('scores cheaper bottles higher, clamped to 100', () => {
    expect(computeValueScore(5, 25)).toBe(100); // raw 200 clamps
    expect(computeValueScore(3, 25)).toBe(100); // raw 120 clamps
  });

  it('scores pricier bottles lower', () => {
    expect(computeValueScore(2, 100)).toBe(20);
  });

  it('rounds to one decimal place', () => {
    // (4.5/5)*100*(50/51) = 88.235… -> 88.2
    expect(computeValueScore(4.5, 51)).toBe(88.2);
  });
});

describe('valueScoreLabel', () => {
  it('bands the descriptor by score', () => {
    expect(valueScoreLabel(95)).toBe('Punches above its weight.');
    expect(valueScoreLabel(80)).toBe('Punches above its weight.');
    expect(valueScoreLabel(79.9)).toBe('Pays its way.');
    expect(valueScoreLabel(60)).toBe('Pays its way.');
    expect(valueScoreLabel(40)).toBe('Fair trade.');
    expect(valueScoreLabel(39.9)).toBe('Love costs what it costs.');
    expect(valueScoreLabel(0)).toBe('Love costs what it costs.');
  });
});
