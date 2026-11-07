import type { ApiClient, ResponseData } from "./client";

/*
 * Session probe: GET /api/v1/auth/get-session. The provider answers 200 with
 * a session/user object or null; cookies travel via the shared transport.
 * Only identity fields are exposed — the session token never leaves here.
 */

type SessionPayload = NonNullable<ResponseData<"/api/v1/auth/get-session", "get">>;
export type SessionUser = SessionPayload["user"];

export interface SessionState {
  user: SessionUser;
  sessionId: string;
  expiresAt: string;
}

export async function probeSession(client: ApiClient, signal?: AbortSignal): Promise<SessionState | null> {
  const { data } = await client.request("get", "/api/v1/auth/get-session", { signal });
  if (!data) return null;
  return { user: data.user, sessionId: data.session.id, expiresAt: data.session.expiresAt };
}
