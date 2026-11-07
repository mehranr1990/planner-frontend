import type { components } from "./generated/openapi";

/*
 * Transport failures. The UI maps `kind` / `code` to copy, never the server
 * message: the backend returns stable generic codes, not private labels.
 */

export type ApiErrorEnvelope = components["schemas"]["ApiError"];
export type ApiErrorCode = ApiErrorEnvelope["error"]["code"];
export type ApiErrorDetail = NonNullable<ApiErrorEnvelope["error"]["details"]>[number];

/** The server answered with a non-success status. */
export class ApiHttpError extends Error {
  readonly kind = "http" as const;
  readonly status: number;
  /** Stable envelope code; undefined when the body was not the documented envelope (e.g. a proxy page). */
  readonly code: ApiErrorCode | undefined;
  readonly details: readonly ApiErrorDetail[];
  /** For support display only; never log request/response content alongside it. */
  readonly requestId: string | undefined;

  constructor(status: number, envelope: ApiErrorEnvelope | undefined, requestId: string | undefined) {
    super(envelope?.error.code ?? `HTTP ${status}`);
    this.name = "ApiHttpError";
    this.status = status;
    this.code = envelope?.error.code;
    this.details = envelope?.error.details ?? [];
    this.requestId = envelope?.error.requestId ?? requestId;
  }

  get isUnauthorized() {
    return this.status === 401;
  }
  /** Closure / quarantine / permission: clear private state, do not retry. */
  get isForbidden() {
    return this.status === 403;
  }
  /** Stale revision or state conflict: refetch and reconcile. */
  get isConflict() {
    return this.status === 409;
  }
  get isRateLimited() {
    return this.status === 429;
  }
}

/** The request never produced an HTTP response (offline, DNS, CORS refusal). Idempotent replays reuse the same key + body. */
export class ApiNetworkError extends Error {
  readonly kind = "network" as const;
  constructor(cause: unknown) {
    super("Network request failed", { cause });
    this.name = "ApiNetworkError";
  }
}

/** A success status whose body did not match the documented media type. */
export class ApiResponseError extends Error {
  readonly kind = "response" as const;
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiResponseError";
    this.status = status;
  }
}

export type ApiError = ApiHttpError | ApiNetworkError | ApiResponseError;

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiHttpError || value instanceof ApiNetworkError || value instanceof ApiResponseError;
}

export function isAbortError(value: unknown): boolean {
  return value instanceof DOMException && value.name === "AbortError";
}

export function parseErrorEnvelope(body: unknown): ApiErrorEnvelope | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const error = (body as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) return undefined;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (typeof code !== "string" || typeof message !== "string") return undefined;
  return body as ApiErrorEnvelope;
}
