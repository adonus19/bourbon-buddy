/**
 * Critic-rating normalization (BB-221).
 *
 * The model returns each printed review score as the RAW string it saw
 * ("92/100", "4.5 stars", "B+") — never a bare number, so it can't invent a
 * scale. `parseRating` is the server-side truth gate: it (1) verifies the raw
 * string appears verbatim in the article (same anti-hallucination line as the
 * BB-219 fact guards), (2) parses the scale by regex or a fixed letter-grade
 * map, and (3) normalizes to 0-100. Anything on an unrecognized scale, or that
 * lands out of range, is DROPPED (null) rather than guessed — a missing score
 * is always safer than a fabricated one. Pure and text-only, so it unit-tests
 * without Firestore.
 */

/**
 * Fixed letter-grade → 0-100 map. Whiskey critics who grade by letter (e.g.
 * Breaking Bourbon) use this A–F scale; the values are the conventional
 * mid-band for each grade so a "B+" and an "88/100" land together.
 */
const LETTER_GRADES: Record<string, number> = {
  "A+": 98, A: 95, "A-": 92,
  "B+": 88, B: 85, "B-": 82,
  "C+": 78, C: 75, "C-": 72,
  "D+": 68, D: 65, "D-": 62,
  F: 50,
};

// Denominators we know how to normalize; the multiplier takes numerator → 100.
// Anything else (e.g. "7/12") is an unrecognized scale and gets dropped.
const FRACTION_SCALES: Record<number, number> = {
  100: 1,
  20: 5,
  10: 10,
  5: 20,
};

const STAR_MAX = 5; // "N stars" is always the 5-star scale.

/** Collapse whitespace + lowercase, for a lenient verbatim comparison. */
function normalizeWhitespace(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Whether the raw rating string is literally present in the article text. */
function appearsVerbatim(raw: string, text: string): boolean {
  if (!text) {
    return false;
  }
  return normalizeWhitespace(text).includes(normalizeWhitespace(raw));
}

/**
 * Parse a raw rating to a 0-100 score by scale, or null when the scale isn't
 * one we recognize. Order matters: an explicit denominator ("4.5/5 stars")
 * wins over the "stars" heuristic.
 */
function normalizeScore(raw: string): number | null {
  const trimmed = raw.trim();

  // Letter grade — exact token only ("B+", "A"), case-insensitive.
  const grade = trimmed.toUpperCase();
  if (Object.prototype.hasOwnProperty.call(LETTER_GRADES, grade)) {
    return LETTER_GRADES[grade];
  }

  // N/M fraction.
  const fraction = trimmed.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+)/);
  if (fraction) {
    const num = Number(fraction[1]);
    const den = Number(fraction[2]);
    const mult = FRACTION_SCALES[den];
    if (mult == null || num > den) {
      return null; // unrecognized scale, or a nonsensical numerator
    }
    return num * mult;
  }

  // N stars (5-star scale).
  const stars = trimmed.match(/(\d+(?:\.\d+)?)\s*stars?\b/i);
  if (stars) {
    const n = Number(stars[1]);
    return n > STAR_MAX ? null : n * (100 / STAR_MAX);
  }

  // N points / pts (100-point scale).
  const points = trimmed.match(/(\d+(?:\.\d+)?)\s*(?:points?|pts?)\b/i);
  if (points) {
    return Number(points[1]);
  }

  // A bare number carries no scale — the model was told never to send one, so
  // treat it as unrecognized rather than assume /100.
  return null;
}

/**
 * Verbatim-verify and normalize a printed review score to 0-100, or null when
 * it's absent from the text, on an unrecognized scale, or out of range.
 */
export function parseRating(raw: string, text: string): number | null {
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed || !appearsVerbatim(trimmed, text)) {
    return null;
  }
  const score = normalizeScore(trimmed);
  if (score == null || score < 0 || score > 100) {
    return null;
  }
  return Math.round(score);
}
