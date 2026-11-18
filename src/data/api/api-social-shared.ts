import { ApiHttpError } from "@/api/errors";
import { newIdempotencyKey, type ApiClient, type ApiClientFor } from "@/api/client";
import type { paths } from "@/api/generated/openapi-p6-social";
import { RepositoryError } from "../repositories";
import { catalogVersion, type RetentionContext } from "./api-retention";
import { toZonedTime } from "@/lib/dates/zone";
import { CURRENCY_DECIMALS, type SocialCurrency, type SocialPerson } from "../social-domain";
import { SocialError } from "../social-repositories";

/*
 * Shared plumbing for every Social live adapter (Phase 6, contract
 * `openapi-p6-social.d.ts`, 149 operations). Rules from the Social handoffs:
 * - errors: 404 / 403 / 400·422 / 409·412 / 413 / 429 → SocialError codes; the
 *   server's stable `error.code` (or first detail code) travels as `reason`;
 * - 429: `Retry-After` seconds travel as `retryAfter` (no blind retry loop);
 * - If-Match: the last revision read (`Revisions`, never older than a newer read);
 * - Idempotency-Key: one per user intent (`Intents`), reused on network / 5xx /
 *   429 retries of the same intent, dropped once the server decided;
 * - money: exact integer minor units as decimal strings ⇄ safe integers
 *   (BigInt checked), never floating point;
 * - instants: Gregorian ISO in transport, wall clock in the record's IANA zone.
 */

export type SocialApi = ApiClientFor<paths>;

/** What every Social adapter module shares for one signed-in user. */
export interface SocialCtx {
  client: ApiClient;
  api: SocialApi;
  people: People;
  revisions: Revisions;
  intents: Intents;
  /** Group names by id (from the caller's group list), for labels only. */
  groupName(groupId: string | null): Promise<string>;
}

/** The operator catalog's single retention policy for `context`; an empty / ambiguous catalog is refused (never guessed). */
export async function retentionVersion(client: ApiClient, context: RetentionContext): Promise<string> {
  try {
    return await catalogVersion(client, context);
  } catch (error) {
    if (error instanceof RepositoryError) throw new SocialError("unsupported", error.message, "RETENTION_POLICY_UNAVAILABLE");
    throw toSocialError(error);
  }
}

export const uuid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : newIdempotencyKey());

/** HTTP failures → SocialError (401 / 5xx / network propagate unchanged). */
export async function call<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw toSocialError(error);
  }
}

export function toSocialError(error: unknown): unknown {
  if (!(error instanceof ApiHttpError)) return error;
  const reason = (error.details[0] as { code?: string } | undefined)?.code ?? (error.code as string | undefined) ?? null;
  const make = (code: ConstructorParameters<typeof SocialError>[0]) => new SocialError(code, reason ?? code, reason, error.retryAfter ?? null);
  if (error.status === 404) return make("not-found");
  if (error.status === 403) return make("forbidden");
  if (error.status === 400 || error.status === 422) return make("invalid");
  if (error.status === 409 || error.status === 412) return make("conflict");
  if (error.status === 413) return make("too-large");
  if (error.status === 429) return make("rate-limited");
  return error;
}

export const reasonOf = (error: unknown): string | null => (error instanceof SocialError ? error.reason : null);

export const fail = (reason: string): never => {
  throw new SocialError("unsupported", reason);
};
export const refuse = (reason: string) => () => Promise.reject(new SocialError("unsupported", reason));

/** Every method of a repository refuses with `reason`. */
export function refused<T extends object>(reason: string): T {
  return new Proxy({} as T, { get: (_, name) => (typeof name === "string" && name !== "then" ? refuse(reason) : undefined) });
}

export async function all<T>(page: (after: string | undefined) => Promise<{ items: T[]; nextCursor?: string | null }>): Promise<T[]> {
  const out: T[] = [];
  let after: string | undefined;
  do {
    const next = await page(after);
    out.push(...next.items);
    after = next.nextCursor ?? undefined;
  } while (after);
  return out;
}

export const pageQuery = (after: string | undefined) => ({ limit: 100, ...(after ? { after } : {}) });

/** Last-read revisions for If-Match. A late (stale) response never lowers a newer revision. */
export class Revisions {
  private readonly map = new Map<string, number>();
  put(key: string, revision: number): void {
    const known = this.map.get(key);
    if (known === undefined || revision >= known) this.map.set(key, revision);
  }
  /** Replaces after a write the server answered (the answer is authoritative). */
  set(key: string, revision: number): void {
    this.map.set(key, revision);
  }
  get(key: string): number | undefined {
    return this.map.get(key);
  }
  drop(prefix: string): void {
    for (const key of [...this.map.keys()]) if (key === prefix || key.startsWith(`${prefix}:`)) this.map.delete(key);
  }
}

export const tag = (revision: number) => `"${revision}"`;

/**
 * One Idempotency-Key per user intent: retries of the same intent (network,
 * 5xx, 429) replay the stored server result; once the server decided (2xx or
 * a 4xx answer) the next attempt is a new intent.
 */
export class Intents {
  private readonly keys = new Map<string, string>();
  async run<T>(intent: string, send: (key: string) => Promise<T>): Promise<T> {
    const key = this.keys.get(intent) ?? newIdempotencyKey();
    this.keys.set(intent, key);
    try {
      const out = await send(key);
      this.keys.delete(intent);
      return out;
    } catch (error) {
      const decided = error instanceof SocialError ? error.code !== "rate-limited" : error instanceof ApiHttpError ? error.status < 500 && error.status !== 429 : false;
      if (decided) this.keys.delete(intent);
      throw error;
    }
  }
}

// ── Money ────────────────────────────────────────────────────────────────

const API_TO_CURRENCY: Record<string, SocialCurrency> = { IRR: "irr", TRY: "try", EUR: "eur" };
const CURRENCY_TO_API: Partial<Record<SocialCurrency, string>> = { irr: "IRR", try: "TRY", eur: "EUR" };

/** ISO code + server scale → the screen currency; anything the screens cannot show exactly is refused. */
export function currencyFromApi(code: string, scale?: number): SocialCurrency {
  const currency = API_TO_CURRENCY[code];
  if (!currency) fail(`currency ${code} is not shown by the Social screens yet`);
  if (scale !== undefined && scale !== CURRENCY_DECIMALS[currency!]) fail(`currency ${code} uses ${scale} decimals; the screens expect ${CURRENCY_DECIMALS[currency!]}`);
  return currency!;
}

export function currencyToApi(currency: SocialCurrency): string {
  const code = CURRENCY_TO_API[currency];
  if (!code) fail("Toman is a display unit; live Social ledgers record Rial (IRR) exactly");
  return code!;
}

/** "-1999" → -1999, exact; values outside the safe integer range are refused, never rounded. */
export function minorFromApi(value: string): number {
  if (!/^-?\d+$/.test(value)) throw new SocialError("invalid", "malformed minor-unit amount");
  const big = BigInt(value);
  if (big > BigInt(Number.MAX_SAFE_INTEGER) || big < -BigInt(Number.MAX_SAFE_INTEGER)) fail("amount exceeds the exact display range");
  return Number(big);
}

export function minorToApi(value: number): string {
  if (!Number.isSafeInteger(value)) throw new SocialError("invalid", "amounts are whole minor units");
  return BigInt(value).toString();
}

// ── Time ─────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");

/** Instant → wall-clock day "YYYY-MM-DD" and "HH:mm" in `timeZone`. */
export function wallClock(instant: string, timeZone: string): { day: string; time: string } {
  const z = toZonedTime(new Date(instant), timeZone);
  return { day: `${z.getFullYear()}-${pad(z.getMonth() + 1)}-${pad(z.getDate())}`, time: `${pad(z.getHours())}:${pad(z.getMinutes())}` };
}

/** Wall clock in `timeZone` → ISO instant (DST-safe: two offset passes). */
export function zonedInstant(day: string, time: string, timeZone: string): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  const wanted = Date.UTC(y, m - 1, d, hh, mm);
  let guess = wanted;
  for (let i = 0; i < 2; i++) {
    const z = toZonedTime(new Date(guess), timeZone);
    const seen = Date.UTC(z.getFullYear(), z.getMonth(), z.getDate(), z.getHours(), z.getMinutes());
    guess += wanted - seen;
  }
  return new Date(guess).toISOString();
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

// ── People ───────────────────────────────────────────────────────────────

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?"
  );
}

/** Names the server served, by user id; the signed-in user is the seam's "me". */
export class People {
  private readonly names = new Map<string, string>();
  constructor(private readonly me: { id: string; name: string }) {}
  learn(userId: string | null | undefined, name: string | null | undefined): void {
    if (userId && name) this.names.set(userId, name);
  }
  person(userId: string | null | undefined): SocialPerson {
    if (!userId) return { id: "", name: "", initials: "?" };
    if (userId === this.me.id) return { id: "me", name: this.me.name, initials: initials(this.me.name) };
    const name = this.names.get(userId) ?? "";
    return { id: userId, name, initials: initials(name) };
  }
  apiId(personId: string): string {
    return personId === "me" ? this.me.id : personId;
  }
  get myId(): string {
    return this.me.id;
  }
}
