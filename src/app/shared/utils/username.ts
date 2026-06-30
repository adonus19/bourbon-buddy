/**
 * Username rules for public handles (BB-100): 3–20 characters, letters/digits/
 * underscore only, case-insensitive uniqueness. The lowercase form is the key
 * for the `/usernames/{usernameLower}` reservation.
 */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
const USERNAME_RE = /^[a-zA-Z0-9_]+$/;

/** The lowercase reservation key for a handle. */
export function usernameKey(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Validates a desired handle. Returns `null` when valid, otherwise a
 * user-facing reason string.
 */
export function validateUsername(raw: string): string | null {
  const v = raw.trim();
  if (v.length < USERNAME_MIN || v.length > USERNAME_MAX) {
    return `Username must be ${USERNAME_MIN}–${USERNAME_MAX} characters.`;
  }
  if (!USERNAME_RE.test(v)) {
    return 'Use only letters, numbers, and underscores.';
  }
  return null;
}
