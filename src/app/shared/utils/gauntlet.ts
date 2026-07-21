/**
 * The Discreet Total Spent gauntlet (BB-229c).
 *
 * ONE reveal runs **all seven stages**, easy → absurd, every single time.
 * There is no per-attempt tier and nothing to resume: abandoning a run means
 * starting over at stage 1.
 *
 * Puzzles are generated from the user's own data plus plain randomness — no AI.
 * That is a deliberate call: a generated answer key can be wrong, and a wrong
 * key locks someone out of their own spend with nothing to validate against.
 * Here the database *is* the answer key, variety grows with the cellar, and it
 * costs nothing. Pure and injectable-random so every rule is unit-testable.
 */

export type GauntletStage =
  | { kind: 'tap'; prompt: string; cta: string }
  | { kind: 'confirm'; prompt: string; yes: string; no: string }
  | { kind: 'phrase'; prompt: string; phrase: string }
  | { kind: 'math'; prompt: string; question: string; answer: number }
  | { kind: 'hold'; prompt: string; seconds: number; holding: string[] }
  | {
      kind: 'pick';
      prompt: string;
      question: string;
      options: { id: string; label: string }[];
      answerId: string;
    }
  | { kind: 'cooldown'; prompt: string; seconds: number; cta: string };

/** A bottle the user has rated. */
export interface RatedBottle {
  name: string;
  rating: number;
}
/** A bottle the user paid for. */
export interface PricedBottle {
  name: string;
  price: number;
}

/** Everything the generator may draw on, richest source first. */
export interface GauntletSources {
  rated: RatedBottle[];
  priced: PricedBottle[];
  /** Current Release Radar order — the app always knows this. */
  radar: string[];
}

/** Failures allowed before we stop the bit and just show them (BB-229d). */
export const GAUNTLET_MAX_FAILURES = 3;

export const HOLD_SECONDS = 10;
export const COOLDOWN_SECONDS = 20;

export const PHRASE_BANK = [
  'I can afford this',
  'It is a hobby not a problem',
  'I have no regrets',
  'This is an investment',
  'I would do it again',
];

/** Last-resort pick stage: well-known bottles with an obvious proof spread. */
const PROOF_BANK: { label: string; proof: number }[] = [
  { label: 'Maker’s Mark (90)', proof: 90 },
  { label: 'Buffalo Trace (90)', proof: 90 },
  { label: 'Wild Turkey 101 (101)', proof: 101 },
  { label: 'Booker’s (125)', proof: 125 },
];

type Rnd = () => number;

const pickIndex = (len: number, rnd: Rnd): number =>
  Math.min(len - 1, Math.floor(rnd() * len));

/** Builds a complete run. Every stage is present, every time. */
export function buildGauntletRun(
  sources: GauntletSources,
  rnd: Rnd = Math.random
): GauntletStage[] {
  const a = 12 + Math.floor(rnd() * 38); // 12–49
  const b = 3 + Math.floor(rnd() * 7); // 3–9

  return [
    {
      kind: 'tap',
      prompt: 'You wanted to see the damage.',
      cta: 'Show me.',
    },
    {
      kind: 'confirm',
      prompt: 'You already know it’s bad.',
      yes: 'Show me anyway',
      no: 'You’re right',
    },
    {
      kind: 'phrase',
      prompt: 'Type it and I’ll believe you.',
      phrase: PHRASE_BANK[pickIndex(PHRASE_BANK.length, rnd)],
    },
    {
      kind: 'math',
      prompt: 'One quick thing.',
      question: `What’s ${a} × ${b}?`,
      answer: a * b,
    },
    {
      kind: 'hold',
      prompt: 'Hold it. All of it.',
      seconds: HOLD_SECONDS,
      holding: ['Reconsidering…', 'Still reconsidering…', 'Fine.'],
    },
    buildPickStage(sources, rnd),
    {
      kind: 'cooldown',
      prompt: 'Twenty seconds. Think about what you’ve done.',
      seconds: COOLDOWN_SECONDS,
      cta: 'Reveal anyway',
    },
  ];
}

/**
 * The stage-6 question, drawn from the best available source:
 *   1. the user's own ratings   2. their own prices
 *   3. the Radar                4. a fixed proof bank
 * A source is only used when it can produce an unambiguous answer — a tie has
 * no right answer, so it is skipped rather than guessed at.
 */
export function buildPickStage(
  sources: GauntletSources,
  rnd: Rnd = Math.random
): Extract<GauntletStage, { kind: 'pick' }> {
  const rated = distinctPair(sources.rated, (x) => x.rating);
  if (rated) {
    const [hi, lo] = rated;
    return twoWay('Which of these did you rate higher?', hi.name, lo.name, rnd);
  }

  const priced = distinctPair(sources.priced, (x) => x.price);
  if (priced) {
    const [hi, lo] = priced;
    return twoWay('Which one did you pay more for?', hi.name, lo.name, rnd);
  }

  const radar = [...new Set(sources.radar)];
  if (radar.length >= 3) {
    const nth = pickIndex(radar.length, rnd) + 1;
    const answer = radar[nth - 1];
    const decoys = radar.filter((n) => n !== answer).slice(0, 3);
    const options = shuffle([answer, ...decoys], rnd).map(toOption);
    return {
      kind: 'pick',
      prompt: 'You do read these, right?',
      question: `Which bottle is #${nth} on your Radar right now?`,
      options,
      answerId: options.find((o) => o.label === answer)!.id,
    };
  }

  const top = PROOF_BANK.reduce((m, x) => (x.proof > m.proof ? x : m));
  const options = shuffle(
    PROOF_BANK.map((p) => p.label),
    rnd
  ).map(toOption);
  return {
    kind: 'pick',
    prompt: 'Last one.',
    question: 'Which of these is highest proof?',
    options,
    answerId: options.find((o) => o.label === top.label)!.id,
  };
}

/** Two entries whose values genuinely differ, else null. */
function distinctPair<T>(items: T[], value: (x: T) => number): [T, T] | null {
  if (items.length < 2) {
    return null;
  }
  const sorted = [...items].sort((x, y) => value(y) - value(x));
  const hi = sorted[0];
  const lo = sorted[sorted.length - 1];
  // A tie has no right answer, so the caller must fall through to another
  // source rather than ask an unanswerable question.
  return value(lo) < value(hi) ? [hi, lo] : null;
}

function twoWay(
  question: string,
  answer: string,
  other: string,
  rnd: Rnd
): Extract<GauntletStage, { kind: 'pick' }> {
  const options = shuffle([answer, other], rnd).map(toOption);
  return {
    kind: 'pick',
    prompt: 'You should know this one.',
    question,
    options,
    answerId: options.find((o) => o.label === answer)!.id,
  };
}

function toOption(label: string, i: number): { id: string; label: string } {
  return { id: `opt-${i}-${label.slice(0, 24)}`, label };
}

function shuffle<T>(items: T[], rnd: Rnd): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rnd() * (i + 1)));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
