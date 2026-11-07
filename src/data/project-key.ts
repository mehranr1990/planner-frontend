/*
 * Project key (PJ-90 New project · task prefix, e.g. WEB-12). Owner rule
 * (DECISIONS "RESOLVED BY OWNER"): uppercase A–Z and 0–9, 2–10 chars,
 * starts with a letter. Suggested from the initials of the name's Latin
 * words; a name with no Latin letters suggests PRJ, then PRJ2, PRJ3… (first
 * unused). Client-side checks are early feedback only — the backend stays
 * authoritative (the handoff contract defines no project key yet; mock only).
 */

export const PROJECT_KEY_MAX = 10;
const KEY_PATTERN = /^[A-Z][A-Z0-9]{1,9}$/;
const FALLBACK = "PRJ";

export type ProjectKeyProblem = "format" | "taken";

export function isValidProjectKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

/** Uppercases and drops anything outside A–Z / 0–9 (input normaliser). */
export function normalizeProjectKey(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, PROJECT_KEY_MAX);
}

function baseKey(name: string): string {
  const words = name.match(/[A-Za-z][A-Za-z0-9]*/g) ?? [];
  if (words.length === 0) return FALLBACK;
  let key = words.map((word) => word[0]).join("").toUpperCase();
  // One Latin word gives one initial: use the word's first letters instead.
  if (key.length < 2) key = (words[0] ?? "").slice(0, 3).toUpperCase();
  if (key.length < 2) return FALLBACK;
  return key.slice(0, PROJECT_KEY_MAX);
}

/** First unused key for `name`: base, base2, base3… (trimmed to stay ≤ 10). */
export function suggestProjectKey(name: string, taken: (key: string) => boolean): string {
  const base = baseKey(name);
  if (!taken(base)) return base;
  for (let n = 2; ; n += 1) {
    const suffix = String(n);
    const candidate = base.slice(0, PROJECT_KEY_MAX - suffix.length) + suffix;
    if (!taken(candidate)) return candidate;
  }
}
