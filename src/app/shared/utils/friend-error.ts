/**
 * Maps a friend-graph callable error (sendFriendRequest / respondToFriendRequest
 * / removeFriend) to a user-facing message, so a rate-limit, block, or duplicate
 * reads clearly instead of a generic failure.
 */
export function friendErrorMessage(e: unknown): string {
  const err = e as { code?: string; message?: string };
  const code = err?.code ?? '';
  if (code.includes('resource-exhausted')) {
    return err.message || "You've sent a lot of requests today. Try tomorrow.";
  }
  if (code.includes('already-exists')) {
    return err.message || "You're already connected or have a request pending.";
  }
  if (code.includes('permission-denied')) {
    return err.message || "You can't send a request to this person.";
  }
  if (code.includes('not-found')) {
    return err.message || 'That person is no longer available.';
  }
  if (code.includes('invalid-argument')) {
    return err.message || 'That request looks off. Try again.';
  }
  return "Couldn't complete that. Try again.";
}
