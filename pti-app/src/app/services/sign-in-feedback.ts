export interface SignInState { busy: boolean; error: string | null; }

export function signInErrorMessage(error: unknown): string {
  const value = error as { code?: string; message?: string } | null;
  const code = value?.code || '';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return 'Sign-in was canceled. Tap Continue with Google to try again.';
  if (code === 'auth/popup-blocked') return 'Your browser blocked Google sign-in. Allow pop-ups for PTI, then try again.';
  if (code === 'auth/network-request-failed') return 'Google sign-in could not connect. Check your connection and try again.';
  if (['auth/unauthorized-domain', 'auth/app-not-authorized', 'auth/invalid-api-key'].includes(code) || /referr?er|API_KEY_HTTP_REFERRER_BLOCKED/i.test(`${code} ${value?.message || ''}`)) return 'PTI sign-in is temporarily unavailable for this address. Please try again after the login update.';
  return 'Google sign-in could not finish. Please try again.';
}
