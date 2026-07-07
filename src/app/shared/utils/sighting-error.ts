/**
 * Maps a sighting-creation error (often a callable error from logSighting,
 * BB-163) to a user-facing message — so a rate-limit or validation failure
 * reads clearly instead of a generic "try again".
 */
export function sightingErrorMessage(e: unknown): string {
  const err = e as { code?: string; message?: string };
  const code = err?.code ?? '';
  if (code.includes('resource-exhausted')) {
    return err.message || 'Daily sighting limit reached. Try again tomorrow.';
  }
  if (code.includes('invalid-argument')) {
    return err.message || 'That sighting looks off — check the price and store.';
  }
  return "Couldn't save the sighting. Try again.";
}

// The server rejected the sighting on its merits; replaying won't change the
// outcome, so the offline outbox (BB-182) must discard rather than retry it.
const PERMANENT_CODES = [
  'resource-exhausted',
  'invalid-argument',
  'permission-denied',
  'failed-precondition',
  'not-found',
];

/**
 * Whether a failed sighting send should be retried later (offline/transient) vs.
 * dropped (a permanent, content-based rejection). Anything without a known
 * permanent code — network errors, `unavailable`, `internal` — is retryable.
 */
export function isRetryableSightingError(e: unknown): boolean {
  const code = (e as { code?: string })?.code ?? '';
  return !PERMANENT_CODES.some((c) => code.includes(c));
}
