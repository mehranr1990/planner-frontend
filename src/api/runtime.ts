import { createApiClient, type ApiClient } from "./client";
import { apiOrigin } from "./config";

/*
 * Which data source the app runs on. "mock" (default) keeps every screen on
 * the in-memory fixtures with no sign-in; "live" turns on the real session
 * (auth gate, account sync). Modules move to the API one by one; until a
 * module is integrated it keeps reading the mock adapter in both modes.
 */
export type ApiMode = "mock" | "live";

export function apiMode(): ApiMode {
  return process.env.NEXT_PUBLIC_API_MODE === "live" ? "live" : "mock";
}

export const isLiveApi = () => apiMode() === "live";

let shared: ApiClient | null = null;

/** The browser's one API client (cookie session, configured origin). */
export function getApiClient(): ApiClient {
  shared ??= createApiClient({ origin: apiOrigin() });
  return shared;
}
