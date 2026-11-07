import { vi } from "vitest";

/*
 * Test helper: routes the shared API client's fetch calls ("METHOD /path")
 * to handlers, and records every call. Works because the client resolves
 * globalThis.fetch per request.
 */

export type Handler = (init: RequestInit, url: string) => Response | Promise<Response>;

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

export const apiError = (status: number, code: string) =>
  json({ error: { code, message: "x", requestId: "6f1c2b8e-3d4a-4b5c-9d6e-7f8091a2b3c4" } }, status);

export const USER = {
  id: "0b6f3a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
  email: "user@example.com",
  emailVerified: true,
  name: "Mehran",
  image: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
};

export const SESSION = {
  session: {
    id: "1c7a4b5f-2d3e-4f60-9b0c-1d2e3f4a5b6c",
    userId: USER.id,
    token: "secret-session-token",
    expiresAt: "2026-12-01T00:00:00.000Z",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  },
  user: USER,
};

export function mockApi(routes: Record<string, Handler>) {
  const calls: { method: string; path: string; init: RequestInit; headers: Headers; body: unknown }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), "http://app.test");
    const method = (init.method ?? "GET").toUpperCase();
    const body = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
    calls.push({ method, path: url.pathname, init, headers: new Headers(init.headers), body });
    const handler = routes[`${method} ${url.pathname}`];
    if (!handler) return apiError(404, "NOT_FOUND");
    return handler(init, url.toString());
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock, find: (method: string, path: string) => calls.filter((c) => c.method === method && c.path === path) };
}
