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
  /** Seconds from a `Retry-After` header (429 / 503); undefined when absent or not delta-seconds. */
  readonly retryAfter: number | undefined;

  constructor(status: number, envelope: ApiErrorEnvelope | undefined, requestId: string | undefined, retryAfter?: string | null) {
    super(envelope?.error.code ?? `HTTP ${status}`);
    this.name = "ApiHttpError";
    this.status = status;
    this.code = envelope?.error.code;
    this.details = envelope?.error.details ?? [];
    this.requestId = envelope?.error.requestId ?? requestId;
    const seconds = retryAfter?.trim();
    this.retryAfter = seconds && /^\d+$/.test(seconds) ? Number(seconds) : undefined;
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

/*
 * Shared activation / recovery reasons (catalog v2 §5, ADR 0069). The current
 * backend envelope reduces them to 403 FORBIDDEN / 409 CONFLICT, so callers
 * also rely on their own signals (catalog 403 or empty, server deadlines);
 * these checks match the codes whenever they do reach the client.
 */
export const SHARED_NOT_ENABLED_CODES: readonly string[] = ["SHARED_ACTIVATION_GATED", "SHARED_RETENTION_UNAVAILABLE"];
export const RECOVERY_EXPIRED_CODES: readonly string[] = ["RESTORE_EXPIRED", "RECOVERY_EXPIRED", "RECOVERY_UNAVAILABLE"];

/** The envelope code plus every detail code. */
export function apiReasonCodes(error: ApiHttpError): string[] {
  const details = error.details.map((detail) => (detail as { code?: unknown }).code).filter((code): code is string => typeof code === "string");
  return error.code ? [error.code as string, ...details] : details;
}

export const hasApiReason = (error: unknown, codes: readonly string[]): boolean =>
  error instanceof ApiHttpError && apiReasonCodes(error).some((code) => codes.includes(code));

/** A Shared feature the operator has not enabled yet (activation gate or no approved retention policy), from the API or a mapped repository error. */
export function isSharedNotEnabled(error: unknown): boolean {
  if (hasApiReason(error, SHARED_NOT_ENABLED_CODES)) return true;
  return error instanceof Error && (SHARED_NOT_ENABLED_CODES.includes(error.message) || SHARED_NOT_ENABLED_CODES.includes(reasonOf(error)));
}

/** A restore / recovery refused because its server deadline passed. */
export const isRecoveryExpired = (error: unknown): boolean =>
  hasApiReason(error, RECOVERY_EXPIRED_CODES) || (error instanceof Error && RECOVERY_EXPIRED_CODES.includes(reasonOf(error)));

const reasonOf = (error: Error): string => {
  const reason = (error as { reason?: unknown }).reason;
  return typeof reason === "string" ? reason : "";
};
