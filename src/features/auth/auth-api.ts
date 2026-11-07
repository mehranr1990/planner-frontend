import type { ApiClient, RequestBody, ResponseData } from "@/api/client";

/*
 * Typed wrappers over the auth and account operations (OpenAPI tags auth,
 * account). Provider tokens in responses (sign-in, sign-up, change-password)
 * are dropped here: the HttpOnly cookie is the only credential.
 */

export type AccountUser = ResponseData<"/api/v1/me", "get">;
export type AccountSettings = ResponseData<"/api/v1/me/settings", "get">;
export type AccountSettingsPatch = RequestBody<"/api/v1/me/settings", "patch">;
export type PersonalSpace = ResponseData<"/api/v1/me/spaces", "get">[number];
export type AuthSession = ResponseData<"/api/v1/auth/list-sessions", "get">[number];

/** Settings plus the exact ETag for the next If-Match. */
export interface VersionedSettings {
  settings: AccountSettings;
  etag: string | undefined;
}

export async function signIn(client: ApiClient, body: { email: string; password: string; rememberMe?: boolean }) {
  const { data } = await client.request("post", "/api/v1/auth/sign-in/email", { body });
  return data?.user;
}

export async function signUp(client: ApiClient, body: { name: string; email: string; password: string; callbackURL?: string }) {
  const { data } = await client.request("post", "/api/v1/auth/sign-up/email", { body });
  return data?.user;
}

export async function signOut(client: ApiClient) {
  await client.request("post", "/api/v1/auth/sign-out", { body: {} });
}

export async function sendVerificationEmail(client: ApiClient, body: { email: string; callbackURL?: string }) {
  await client.request("post", "/api/v1/auth/send-verification-email", { body });
}

export async function requestPasswordReset(client: ApiClient, body: { email: string; redirectTo?: string }) {
  await client.request("post", "/api/v1/auth/request-password-reset", { body });
}

export async function resetPassword(client: ApiClient, body: { token: string; newPassword: string }) {
  await client.request("post", "/api/v1/auth/reset-password", { body });
}

export async function changePassword(
  client: ApiClient,
  body: { currentPassword: string; newPassword: string; revokeOtherSessions?: boolean },
) {
  const { data } = await client.request("post", "/api/v1/auth/change-password", { body });
  return data?.user;
}

export async function changeEmail(client: ApiClient, body: { newEmail: string; callbackURL?: string }) {
  await client.request("post", "/api/v1/auth/change-email", { body });
}

/** Session tokens stay in memory only (they are the revoke handle); never render or persist them. */
export async function listSessions(client: ApiClient): Promise<AuthSession[]> {
  const { data } = await client.request("get", "/api/v1/auth/list-sessions");
  return data ?? [];
}

export async function revokeSession(client: ApiClient, token: string) {
  await client.request("post", "/api/v1/auth/revoke-session", { body: { token } });
}

export async function revokeOtherSessions(client: ApiClient) {
  await client.request("post", "/api/v1/auth/revoke-other-sessions", { body: {} });
}

export async function getMe(client: ApiClient, signal?: AbortSignal): Promise<AccountUser> {
  const { data } = await client.request("get", "/api/v1/me", { signal });
  return data;
}

export async function updateMe(client: ApiClient, body: { name?: string }): Promise<AccountUser> {
  const { data } = await client.request("patch", "/api/v1/me", { body });
  return data;
}

export async function getSettings(client: ApiClient, signal?: AbortSignal): Promise<VersionedSettings> {
  const { data, etag } = await client.request("get", "/api/v1/me/settings", { signal });
  return { settings: data, etag };
}

export async function updateSettings(
  client: ApiClient,
  patch: AccountSettingsPatch,
  etag: string | undefined,
): Promise<VersionedSettings> {
  const { data, etag: next } = await client.request("patch", "/api/v1/me/settings", {
    body: patch,
    header: etag ? { "If-Match": etag } : {},
  });
  return { settings: data, etag: next };
}

export async function getPersonalSpace(client: ApiClient, signal?: AbortSignal): Promise<PersonalSpace | null> {
  const { data } = await client.request("get", "/api/v1/me/spaces", { signal });
  return data[0] ?? null;
}
