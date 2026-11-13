import { createApiClient } from "@/api/client";

/* Test-only: a recording fetch for the in-memory contract fakes of the module adapters. */

export interface FakeCall {
  method: string;
  path: string;
  query: Record<string, string>;
  ifMatch: string | null;
  key: string | null;
  body: Record<string, unknown>;
}

export const json = (body: unknown, status = 200, etag?: string) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...(etag ? { ETag: etag } : {}) } });

export const err = (status: number, code = "X") => json({ error: { code, message: "x", requestId: "6f1c2b8e-3d4a-4b5c-9d6e-7f8091a2b3c4" } }, status);

/** `handle` gets each call with the path split after /api/v1 ("habits", id, …). */
export function fakeApi(handle: (call: FakeCall, parts: string[]) => Response) {
  const calls: FakeCall[] = [];
  const fetchImpl: typeof fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const headers = new Headers(init.headers);
    const call: FakeCall = {
      method: (init.method ?? "GET").toUpperCase(),
      path: url.pathname.replace(/^\/api\/v1/, ""),
      query: Object.fromEntries(url.searchParams),
      ifMatch: headers.get("If-Match"),
      key: headers.get("Idempotency-Key"),
      body: typeof init.body === "string" && init.body ? JSON.parse(init.body) : {},
    };
    calls.push(call);
    return handle(call, call.path.split("/").filter(Boolean));
  };
  const client = createApiClient({ origin: "http://api.test", fetch: fetchImpl });
  /** Calls that change something, as "METHOD /path". */
  const writes = () => calls.filter((call) => call.method !== "GET").map((call) => `${call.method} ${call.path}`);
  return { client, calls, writes };
}
