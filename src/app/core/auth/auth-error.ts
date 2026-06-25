/**
 * Maps Firebase Auth error codes to the plain, specific copy defined in the
 * UI/UX brief. Unknown errors fall back to a generic-but-honest message.
 */
export function authErrorMessage(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return "Email or password didn't match.";
    case 'auth/email-already-in-use':
      return 'An account with that email already exists.';
    case 'auth/weak-password':
      return 'Password needs to be at least 8 characters.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a moment and try again.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Sign-in was cancelled.';
    case 'auth/network-request-failed':
      return 'Network problem. Check your connection and try again.';
    default:
      return 'Something went wrong. Try again.';
  }
}
