/*
 * Leaving the signed-in app is a full document navigation: it drops every
 * in-memory store (React Query, mock repositories, timers) in one step.
 * Kept in its own module so tests can replace it.
 */
export function hardNavigate(url: string) {
  window.location.replace(url);
}

/** A same-origin, app-relative return path, or null (blocks open redirects like //evil.test). */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  return value;
}

export const AUTH_ROUTES = {
  signIn: "/sign-in",
  signUp: "/sign-up",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  verifyEmail: "/verify-email",
} as const;

export type SignInReason = "expired" | "signed-out" | "revoked";

export function signInHref(reason?: SignInReason, next?: string | null): string {
  const params = new URLSearchParams();
  if (reason) params.set("reason", reason);
  const safe = safeNextPath(next);
  if (safe) params.set("next", safe);
  const qs = params.toString();
  return qs ? `${AUTH_ROUTES.signIn}?${qs}` : AUTH_ROUTES.signIn;
}

/** Absolute link the backend may redirect to from an email (must be a backend-trusted origin). */
export function callbackUrl(path: string): string {
  return new URL(path, window.location.origin).toString();
}
