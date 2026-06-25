/**
 * Value Score = (rating / 5) * 100 / purchasePrice.
 * Only defined when BOTH a rating and a purchase price are present (and price
 * > 0). Stored (denormalized) on the log entry so the list can sort on it
 * without a computed query. See docs/bourbon-buddy-data-model.md.
 *
 * NOTE: the formula and the display thresholds/example in the UI/UX brief
 * (e.g. "87.3", "80+") are on different scales — flagged for the team to
 * reconcile before the value-score *display* lands (Iteration 2, Pass 3).
 */
export function computeValueScore(
  rating: number | null | undefined,
  purchasePrice: number | null | undefined
): number | null {
  if (rating == null || purchasePrice == null || purchasePrice <= 0) {
    return null;
  }
  const score = ((rating / 5) * 100) / purchasePrice;
  // Keep two decimals; raw precision isn't meaningful for display or sorting.
  return Math.round(score * 100) / 100;
}
