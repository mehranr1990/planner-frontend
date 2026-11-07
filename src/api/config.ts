/*
 * API origin. Configured per deployment via NEXT_PUBLIC_API_ORIGIN (origin
 * only — routes already carry /api/v1). Empty means same origin, e.g. a
 * reverse proxy that serves the API under the frontend's host.
 */
export function apiOrigin(): string {
  const value = process.env.NEXT_PUBLIC_API_ORIGIN?.trim() ?? "";
  if (!value) return "";
  const url = new URL(value);
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("NEXT_PUBLIC_API_ORIGIN must be an origin (scheme://host[:port]) without a path.");
  }
  return url.origin;
}
