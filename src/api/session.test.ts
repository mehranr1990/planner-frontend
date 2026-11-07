import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./client";
import { ApiHttpError, ApiNetworkError } from "./errors";
import { probeSession } from "./session";

const USER_ID = "0b6f3a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const SESSION_ID = "1c7a4b5f-2d3e-4f60-9b0c-1d2e3f4a5b6c";

const sessionBody = {
  session: {
    id: SESSION_ID,
    userId: USER_ID,
    token: "secret-session-token",
    expiresAt: "2026-12-01T00:00:00.000Z",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  },
  user: { id: USER_ID, email: "user@example.com", emailVerified: true, name: "Mehran" },
};

function clientReturning(response: Response | Promise<Response>) {
  const fetchMock = vi.fn<typeof fetch>(async () => response);
  return { client: createApiClient({ origin: "http://api.test", fetch: fetchMock }), fetchMock };
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("probeSession", () => {
  it("calls GET /api/v1/auth/get-session with cookies", async () => {
    const { client, fetchMock } = clientReturning(jsonResponse(null));
    await probeSession(client);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://api.test/api/v1/auth/get-session");
    expect(init).toMatchObject({ method: "GET", credentials: "include" });
  });

  it("returns identity for an active session and never exposes the token", async () => {
    const { client } = clientReturning(jsonResponse(sessionBody));
    const state = await probeSession(client);
    expect(state).toEqual({ user: sessionBody.user, sessionId: SESSION_ID, expiresAt: sessionBody.session.expiresAt });
    expect(JSON.stringify(state)).not.toContain("secret-session-token");
  });

  it("returns null when signed out", async () => {
    const { client } = clientReturning(jsonResponse(null));
    expect(await probeSession(client)).toBeNull();
  });

  it("surfaces 401/403 as ApiHttpError so callers clear private state", async () => {
    const envelope = (code: string) => ({ error: { code, message: "x", requestId: SESSION_ID } });
    for (const [status, code] of [[401, "UNAUTHORIZED"], [403, "FORBIDDEN"]] as const) {
      const { client } = clientReturning(jsonResponse(envelope(code), status));
      const error = (await probeSession(client).catch((e: unknown) => e)) as ApiHttpError;
      expect(error).toBeInstanceOf(ApiHttpError);
      expect([error.status, error.code]).toEqual([status, code]);
    }
  });

  it("reports an unreachable backend as ApiNetworkError", async () => {
    const { client } = clientReturning(Promise.reject(new TypeError("Failed to fetch")));
    await expect(probeSession(client)).rejects.toBeInstanceOf(ApiNetworkError);
  });
});
