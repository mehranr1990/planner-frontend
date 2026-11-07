import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApiClient, type ApiClient } from "@/api/client";
import { ApiHttpError } from "@/api/errors";
import { probeSession } from "@/api/session";
import {
  changeEmail,
  getMe,
  getPersonalSpace,
  getSettings,
  listSessions,
  requestPasswordReset,
  resetPassword,
  revokeOtherSessions,
  signIn,
  signOut,
  signUp,
  updateMe,
  updateSettings,
} from "./auth-api";

/*
 * Live contract smoke for 00b against a running backend (skipped otherwise):
 *
 *   API_LIVE_ORIGIN=http://localhost:3000 \
 *   API_LIVE_TRUSTED_ORIGIN=http://localhost:3000 \
 *   API_LIVE_MAIL_DIR=../planner-backend/apps/api/.tools/mail \
 *   npx vitest run src/features/auth/auth.live.test.ts
 *
 * Node stands in for the browser: a cookie jar keeps the HttpOnly cookies and
 * every request carries a backend-trusted Origin (browsers add it themselves;
 * the app never sets it). Mail links are read from the backend's local sink.
 * Creates a throwaway account per run.
 */

const origin = process.env.API_LIVE_ORIGIN;
const trusted = process.env.API_LIVE_TRUSTED_ORIGIN;
const mailDir = process.env.API_LIVE_MAIL_DIR;

function browserLikeClient(): { client: ApiClient; cookies: Map<string, string> } {
  const cookies = new Map<string, string>();
  const jarFetch: typeof fetch = async (input, init = {}) => {
    // A plain record: a Headers object may drop forbidden names (Origin, Cookie) under jsdom.
    const headers: Record<string, string> = Object.fromEntries(new Headers(init.headers));
    headers.Origin = trusted!;
    if (cookies.size) headers.Cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    const response = await fetch(input, { ...init, headers });
    for (const line of response.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(";");
      const [name, ...rest] = pair!.split("=");
      const value = rest.join("=");
      const expired = attrs.some((a) => /max-age=0/i.test(a.trim())) || value === "";
      if (expired) cookies.delete(name!.trim());
      else cookies.set(name!.trim(), value);
    }
    return response;
  };
  return { client: createApiClient({ origin: origin!, fetch: jarFetch }), cookies };
}

async function mailUrl(to: string, kind: RegExp, after: number): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    for (const file of readdirSync(mailDir!)) {
      const path = join(mailDir!, file);
      if (statSync(path).mtimeMs < after) continue;
      const mail = JSON.parse(readFileSync(path, "utf8")) as { to: string; url: string; kind: string };
      if (mail.to === to && kind.test(mail.kind + " " + mail.url)) return mail.url;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`no ${kind} mail for test account`);
}

/** Login is limited to three attempts per ten seconds per IP. */
const loginCooldown = () => new Promise((resolve) => setTimeout(resolve, 10_500));

async function status(promise: Promise<unknown>): Promise<number> {
  try {
    await promise;
    return 200;
  } catch (error) {
    if (error instanceof ApiHttpError) return error.status;
    throw error;
  }
}

describe.skipIf(!origin || !trusted || !mailDir)("live auth, session, profile and settings", () => {
  it("covers sign-up → verify → sign-in → account → ETag/409 → sessions → reset → sign-out", { timeout: 90_000 }, async () => {
    const started = Date.now() - 1000;
    const email = `claude-00b-${Date.now()}@example.com`;
    const password = "Passw0rd-00b-live";
    const a = browserLikeClient();

    // Sign-up provisions but does not sign in; unverified sign-in is refused.
    const created = await signUp(a.client, { name: "Live 00b", email, password, callbackURL: `${trusted}/verify-email` });
    expect(created?.emailVerified).toBe(false);
    expect(await probeSession(a.client)).toBeNull();
    expect(await status(signIn(a.client, { email, password }))).toBe(403);
    expect(await status(signIn(a.client, { email, password: "wrong-password-x" }))).toBe(401);

    // Verification link → redirect to the trusted frontend callback.
    const verify = new URL(await mailUrl(email, /verif/i, started));
    const verified = await fetch(verify, { redirect: "manual", headers: { Origin: trusted! } });
    expect(verified.status).toBe(302);
    const verifyLanding = new URL(verified.headers.get("Location")!, trusted);
    expect(verifyLanding.origin + verifyLanding.pathname).toBe(`${trusted}/verify-email`);
    expect(verifyLanding.searchParams.has("error")).toBe(false);

    // Signed-in flows need a ready backend: without erasure-control evidence it
    // quarantines private access (GET /health/ready 503, every sign-in 403).
    const ready = await fetch(`${origin}/health/ready`);
    if (ready.status !== 200) {
      console.warn(`live 00b: /health/ready ${ready.status} — signed-in flows NOT VERIFIED`);
      expect(await status(signIn(a.client, { email, password }))).toBe(403);
      return;
    }

    // Sign-in sets the HttpOnly session cookie; the session restores from it alone.
    await loginCooldown();
    await signIn(a.client, { email, password });
    expect([...a.cookies.keys()].some((name) => name.includes("session_token"))).toBe(true);
    const session = await probeSession(a.client);
    expect(session?.user.email).toBe(email);
    expect(session?.user.emailVerified).toBe(true);

    // Profile, owned Personal Space, settings with a quoted ETag.
    expect((await getMe(a.client)).email).toBe(email);
    expect((await getPersonalSpace(a.client))?.kind).toBe("PERSONAL");
    const first = await getSettings(a.client);
    expect(first.etag).toMatch(/^(W\/)?".+"$/);
    const renamed = await updateMe(a.client, { name: "Live 00b renamed" });
    expect(renamed.name).toBe("Live 00b renamed");

    // Email change (fresh session): accepted, confirmation goes to the current mailbox first.
    await changeEmail(a.client, { newEmail: `changed-${email}`, callbackURL: `${trusted}/verify-email` });
    expect(await mailUrl(email, /change|email/i, Date.now() - 5000)).toBeTruthy();
    expect((await getMe(a.client)).email).toBe(email);

    // If-Match write → new ETag; the stale ETag is a 409.
    const nextCalendar = first.settings.preferredCalendar === "JALALI" ? "GREGORIAN" : "JALALI";
    const second = await updateSettings(a.client, { preferredCalendar: nextCalendar }, first.etag);
    expect(second.settings.preferredCalendar).toBe(nextCalendar);
    expect(second.etag).not.toBe(first.etag);
    expect(await status(updateSettings(a.client, { firstDayOfWeek: 6 }, first.etag))).toBe(409);

    // Second device; revoking other sessions signs it out.
    const b = browserLikeClient();
    await signIn(b.client, { email, password });
    expect((await listSessions(a.client)).length).toBeGreaterThanOrEqual(2);
    await revokeOtherSessions(a.client);
    expect(await probeSession(b.client)).toBeNull();
    expect(await status(getMe(b.client))).toBe(401);
    expect((await probeSession(a.client))?.user.email).toBe(email);

    // Password reset: generic answer, provider callback redirect, single-use token, sessions revoked.
    await requestPasswordReset(a.client, { email, redirectTo: `${trusted}/reset-password` });
    const resetLink = new URL(await mailUrl(email, /reset/i, started));
    const callback = await fetch(resetLink, { redirect: "manual" });
    expect(callback.status).toBe(302);
    const landing = new URL(callback.headers.get("Location")!, trusted);
    expect(landing.origin + landing.pathname).toBe(`${trusted}/reset-password`);
    const token = landing.searchParams.get("token")!;
    expect(token).toBeTruthy();
    const newPassword = "Passw0rd-00b-reset";
    await resetPassword(a.client, { token, newPassword });
    expect(await status(resetPassword(a.client, { token, newPassword: "Passw0rd-00b-again" }))).toBe(400);
    expect(await probeSession(a.client)).toBeNull();

    // Sign back in, then sign out: the cookie no longer authorizes anything.
    await loginCooldown();
    await signIn(a.client, { email, password: newPassword });
    expect((await probeSession(a.client))?.user.email).toBe(email);
    await signOut(a.client);
    expect(await probeSession(a.client)).toBeNull();
    expect(await status(getMe(a.client))).toBe(401);
  });
});
