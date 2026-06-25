/**
 * Value Score — a 0–100 "rating per dollar" index. Only defined when BOTH a
 * rating and a purchase price (> 0) are present. Stored (denormalized) on the
 * log entry so the list can sort on it without a computed query.
 *
 * Scale: PAR_PRICE is treated as a "par" bottle price — at exactly par, the
 * score equals the rating percentage (5★ → 100, 4★ → 80). Cheaper bottles
 * score higher, pricier bottles lower, clamped to 0–100. This puts the result
 * on the 0–100 range the UI/UX brief's descriptor bands and example assume
 * (e.g. a 4.5★ bottle around $51 → ~87.3).
 *
 *   score = (rating / 5) * 100 * (PAR_PRICE / price)   // clamped 0–100
 *
 * Descriptor bands (used by the detail display in Pass 3):
 *   80+   "Punches above its weight."
 *   60–79 "Pays its way."
 *   40–59 "Fair trade."
 *   <40   "Love costs what it costs."
 */
export const VALUE_SCORE_PAR_PRICE = 50;

export function computeValueScore(
  rating: number | null | undefined,
  purchasePrice: number | null | undefined
): number | null {
  if (rating == null || purchasePrice == null || purchasePrice <= 0) {
    return null;
  }
  const raw = (rating / 5) * 100 * (VALUE_SCORE_PAR_PRICE / purchasePrice);
  const clamped = Math.min(100, Math.max(0, raw));
  return Math.round(clamped * 10) / 10; // one decimal, matches the display
}
