import { createApiClient, type ApiClient } from "@/api/client";
import { dayOfInstant } from "@/lib/dates/clock-time";
import { APP_TIME_ZONE, setPlannerTimeZone } from "@/lib/dates/zone";

/*
 * Shared by the env-gated `*.live.test.ts` files of the Personal modules (skipped unless configured):
 *   API_LIVE_ORIGIN API_LIVE_TRUSTED_ORIGIN API_LIVE_EMAIL API_LIVE_PASSWORD
 * Node stands in for the browser: a cookie jar keeps the HttpOnly session cookie and every
 * request carries a backend-trusted Origin. Run one file at a time (sign-in is rate limited).
 */

const origin = process.env.API_LIVE_ORIGIN;
const trusted = process.env.API_LIVE_TRUSTED_ORIGIN;
const email = process.env.API_LIVE_EMAIL;
const password = process.env.API_LIVE_PASSWORD;

export const liveConfigured = Boolean(origin && trusted && email && password);

/** A signed-in client in the account's time zone; `end()` restores the app zone. */
export async function liveSession(): Promise<{ client: ApiClient; today: string; end: () => void }> {
  const cookies = new Map<string, string>();
  const jarFetch: typeof fetch = async (input, init = {}) => {
    const headers: Record<string, string> = Object.fromEntries(new Headers(init.headers));
    headers.Origin = trusted!;
    if (cookies.size) headers.Cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    const response = await fetch(input, { ...init, headers });
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const index = pair!.indexOf("=");
      cookies.set(pair!.slice(0, index).trim(), pair!.slice(index + 1));
    }
    return response;
  };
  const client = createApiClient({ origin: origin!, fetch: jarFetch });
  await client.request("post", "/api/v1/auth/sign-in/email", { body: { email: email!, password: password! } });
  setPlannerTimeZone((await client.request("get", "/api/v1/me/settings")).data.timezone);
  return { client, today: dayOfInstant(new Date().toISOString()), end: () => setPlannerTimeZone(APP_TIME_ZONE) };
}
