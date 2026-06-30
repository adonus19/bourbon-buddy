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
