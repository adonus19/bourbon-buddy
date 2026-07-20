import {
  GAUNTLET_MAX_FAILURES,
  GauntletSources,
  PHRASE_BANK,
  buildGauntletRun,
  buildPickStage,
} from './gauntlet';

/** Deterministic "random": walks the queued values, then repeats the last. */
function seq(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

const empty: GauntletSources = { rated: [], priced: [], radar: [] };

describe('buildGauntletRun', () => {
  it('always builds all seven stages, in escalating order', () => {
    // One reveal runs the whole ladder every time — there is no resume point.
    const run = buildGauntletRun(empty, seq([0]));
    expect(run.map((s) => s.kind)).toEqual([
      'tap',
      'confirm',
      'phrase',
      'math',
      'hold',
      'pick',
      'cooldown',
    ]);
  });

  it('ends on a 20 second cooldown', () => {
    const run = buildGauntletRun(empty, seq([0]));
    const last = run[6];
    expect(last.kind).toBe('cooldown');
    expect(last.kind === 'cooldown' && last.seconds).toBe(20);
  });

  it('holds for 10 seconds', () => {
    const run = buildGauntletRun(empty, seq([0]));
    const hold = run[4];
    expect(hold.kind === 'hold' && hold.seconds).toBe(10);
  });

  it('generates a solvable math stage whose answer matches the question', () => {
    const run = buildGauntletRun(empty, seq([0.5]));
    const math = run[3];
    if (math.kind !== 'math') {
      throw new Error('expected a math stage');
    }
    const [a, b] = math.question.match(/\d+/g)!.map(Number);
    expect(math.answer).toBe(a * b);
  });

  it('varies the math between runs rather than repeating one problem', () => {
    const a = buildGauntletRun(empty, seq([0.1]))[3];
    const b = buildGauntletRun(empty, seq([0.9]))[3];
    expect(a.kind === 'math' && a.question).not.toBe(
      b.kind === 'math' && b.question
    );
  });

  it('draws the phrase from the bank', () => {
    const run = buildGauntletRun(empty, seq([0]));
    const phrase = run[2];
    expect(phrase.kind === 'phrase' && PHRASE_BANK).toContain(
      phrase.kind === 'phrase' ? phrase.phrase : ''
    );
  });
});

describe('buildPickStage — source priority', () => {
  it('prefers the user’s own ratings when two differ', () => {
    const stage = buildPickStage(
      {
        rated: [
          { name: 'Weller 12', rating: 4.5 },
          { name: 'Old Grand-Dad', rating: 3 },
        ],
        priced: [],
        radar: [],
      },
      seq([0])
    );
    expect(stage.question).toMatch(/rate higher/i);
    // The answer is whatever the database says — never a guess.
    const answer = stage.options.find((o) => o.id === stage.answerId);
    expect(answer?.label).toBe('Weller 12');
  });

  it('falls back to purchase prices when ratings are unusable', () => {
    const stage = buildPickStage(
      {
        rated: [{ name: 'Only One', rating: 4 }],
        priced: [
          { name: 'Pricey', price: 90 },
          { name: 'Cheap', price: 30 },
        ],
        radar: [],
      },
      seq([0])
    );
    expect(stage.question).toMatch(/pay more/i);
    expect(stage.options.find((o) => o.id === stage.answerId)?.label).toBe(
      'Pricey'
    );
  });

  it('skips a comparison where both sides tie, since it has no right answer', () => {
    const stage = buildPickStage(
      {
        rated: [
          { name: 'A', rating: 4 },
          { name: 'B', rating: 4 },
        ],
        priced: [],
        radar: ['R1', 'R2', 'R3', 'R4'],
      },
      seq([0])
    );
    expect(stage.question).not.toMatch(/rate higher/i);
  });

  it('falls back to the Radar when the cellar is thin', () => {
    const stage = buildPickStage(
      { rated: [], priced: [], radar: ['First', 'Second', 'Third', 'Fourth'] },
      seq([0])
    );
    // The app always knows the Radar order, so this is always answerable.
    expect(stage.question).toMatch(/radar/i);
    expect(stage.options).toHaveLength(4);
    expect(stage.options.map((o) => o.label)).toEqual(
      expect.arrayContaining(['First'])
    );
  });

  it('asks about a Radar position that actually exists', () => {
    const stage = buildPickStage(
      { rated: [], priced: [], radar: ['A', 'B', 'C', 'D', 'E'] },
      seq([0.99])
    );
    const nth = Number(stage.question.match(/(\d+)/)![1]);
    expect(nth).toBeGreaterThanOrEqual(1);
    expect(nth).toBeLessThanOrEqual(5);
    expect(stage.options.find((o) => o.id === stage.answerId)?.label).toBe(
      ['A', 'B', 'C', 'D', 'E'][nth - 1]
    );
  });

  it('falls back to the fixed proof bank when there is no data at all', () => {
    const stage = buildPickStage(empty, seq([0]));
    expect(stage.question).toMatch(/proof/i);
    expect(stage.options.length).toBeGreaterThanOrEqual(3);
    expect(stage.answerId).toBeTruthy();
  });

  it('always produces exactly one correct option', () => {
    const sources: GauntletSources[] = [
      { rated: [{ name: 'A', rating: 5 }, { name: 'B', rating: 2 }], priced: [], radar: [] },
      { rated: [], priced: [{ name: 'A', price: 9 }, { name: 'B', price: 4 }], radar: [] },
      { rated: [], priced: [], radar: ['A', 'B', 'C', 'D'] },
      empty,
    ];
    for (const s of sources) {
      const stage = buildPickStage(s, seq([0.3]));
      const matches = stage.options.filter((o) => o.id === stage.answerId);
      expect(matches).toHaveLength(1);
    }
  });

  it('never offers duplicate options', () => {
    const stage = buildPickStage(
      { rated: [], priced: [], radar: ['A', 'B', 'C', 'D', 'E', 'F'] },
      seq([0.5])
    );
    const labels = stage.options.map((o) => o.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('escape hatch', () => {
  it('bails the user out after three failures', () => {
    // The gauntlet is a commitment device, not a lock.
    expect(GAUNTLET_MAX_FAILURES).toBe(3);
  });
});
