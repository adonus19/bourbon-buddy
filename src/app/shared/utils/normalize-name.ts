/**
 * Canonical normalization for bourbon names (BB-160). Folds away the cosmetic
 * differences that create duplicate catalog entries — case, punctuation,
 * diacritics, and whitespace — so "Blanton's Single Barrel", "Blantons Single
 * Barrel", and "blantons  single barrel" all map to the same key.
 *
 * Deliberately conservative: it does NOT strip descriptive words (e.g. "single
 * barrel"), since those distinguish genuinely different bottles. Fuzzy/typo
 * matching is a separate, later concern.
 */
const DIACRITICS = /[̀-ͯ]/g;
const DROP_PUNCT = /['’`".]/g; // apostrophes (straight + curly), backtick, quote, period
const NON_ALNUM = /[^a-z0-9]+/g;

export function normalizeBottleName(name: string): string {
  return String(name ?? '')
    .normalize('NFKD') // separate diacritics from base letters
    .replace(DIACRITICS, '') // strip the diacritic marks
    .toLowerCase()
    .replace(DROP_PUNCT, '') // drop apostrophes, quotes, periods
    .replace(NON_ALNUM, ' ') // any other non-alphanumeric -> space
    .replace(/\s+/g, ' ') // collapse runs of whitespace
    .trim();
}
