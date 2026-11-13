import type { paths } from "./generated/openapi";
import { ApiHttpError, ApiNetworkError, ApiResponseError, isAbortError, parseErrorEnvelope } from "./errors";

/*
 * The typed HTTP transport. Every path, parameter, body and success payload
 * comes from the generated OpenAPI types (`npm run api:types`); nothing here
 * is hand-written per route. Repositories build on this — components never
 * call it directly.
 *
 * Contract rules applied for every call:
 * - Cookie session: `credentials: "include"`, no bearer token, never sets Origin.
 * - Private data: `cache: "no-store"` so no shared HTTP cache holds it.
 * - JSON bodies get `Content-Type: application/json`; raw bodies pass through.
 * - ETag is returned verbatim (quotes kept) for the next If-Match.
 * - 204 / non-JSON success bodies are not parsed as JSON.
 */

export type HttpMethod = "get" | "put" | "post" | "delete" | "patch" | "head";

type Empty = Record<never, never>;
type Operation<P extends keyof paths, M extends HttpMethod> = NonNullable<paths[P][M]>;

/** Paths that declare method M. */
export type PathsWith<M extends HttpMethod> = {
  [P in keyof paths]: paths[P][M] extends { responses: unknown } ? P : never;
}[keyof paths];

type Params<Op> = Op extends { parameters: infer Prm } ? Prm : never;
type ParamPart<Op, K extends "path" | "query" | "header"> =
  Params<Op> extends { [Q in K]?: infer V } ? Exclude<V, undefined> : never;

// The contract lists Origin as a header, but it is browser-owned (forbidden in JS): never typed, never sent.
type ParamGroups<Op> = {
  path: ParamPart<Op, "path">;
  query: ParamPart<Op, "query">;
  header: [ParamPart<Op, "header">] extends [never] ? never : Omit<ParamPart<Op, "header">, "Origin">;
};
type PresentGroups<Op> = {
  [K in keyof ParamGroups<Op> as [ParamGroups<Op>[K]] extends [never] ? never : K]: ParamGroups<Op>[K];
};
// A group is required when it has a required member (e.g. path ids, If-Match).
type ParamsInit<Op> = {
  [K in keyof PresentGroups<Op> as Empty extends PresentGroups<Op>[K] ? never : K]: PresentGroups<Op>[K];
} & {
  [K in keyof PresentGroups<Op> as Empty extends PresentGroups<Op>[K] ? K : never]?: PresentGroups<Op>[K];
};

export type RawBody = Blob | ArrayBuffer | Uint8Array;
type BodyFrom<C> =
  | (C extends { "application/json": infer J } ? J : never)
  | (C extends { "application/octet-stream": unknown } ? RawBody : never);
type JsonBody<Op> = Op extends { requestBody?: { content: { "application/json": infer B } } } ? B : never;
type BodyInit_<Op> = Op extends { requestBody?: infer RB }
  ? [Exclude<RB, undefined>] extends [never]
    ? { body?: never }
    : Op extends { requestBody: { content: infer C } }
      ? { body: BodyFrom<C> }
      : { body?: BodyFrom<Exclude<RB, undefined> extends { content: infer C } ? C : never> }
  : { body?: never };

type SuccessStatus = 200 | 201 | 202 | 203 | 204 | 205 | 206;
type Responses<Op> = Op extends { responses: infer R } ? R : never;
type ContentOf<R> = R extends { content: infer C } ? ([C] extends [never] ? Empty : C) : Empty;
type SuccessContent<Op> = ContentOf<Responses<Op>[Extract<keyof Responses<Op>, SuccessStatus>]>;

type BinaryMedia = "text/csv" | "application/octet-stream";
/**
 * What the transport resolves per success response: JSON → parsed body, CSV/octet-stream → Blob,
 * no content (204) → undefined. A union when an operation offers several (e.g. JSON or CSV export).
 */
type DataOf<C> = C extends unknown
  ?
      | ("application/json" extends keyof C ? C["application/json"] : never)
      | ([Extract<keyof C, BinaryMedia>] extends [never] ? never : Blob)
      | ([Extract<keyof C, "application/json" | BinaryMedia>] extends [never] ? undefined : never)
  : never;

export type ResponseData<P extends keyof paths, M extends HttpMethod> = DataOf<SuccessContent<Operation<P, M>>>;
export type RequestBody<P extends keyof paths, M extends HttpMethod> = JsonBody<Operation<P, M>>;

export type RequestInitFor<P extends keyof paths, M extends HttpMethod> = ParamsInit<Operation<P, M>> &
  BodyInit_<Operation<P, M>> & {
  signal?: AbortSignal;
  /** Default "follow"; pass "manual" for provider redirects the UI must observe. */
  redirect?: RequestRedirect;
};

export interface ApiResult<T> {
  data: T;
  status: number;
  /** Exact ETag header (quotes preserved) or undefined. */
  etag: string | undefined;
  requestId: string | undefined;
  headers: Headers;
}

export interface ApiClientOptions {
  /** API origin without path, e.g. "http://localhost:4000". Empty = same origin. Paths already include /api/v1. */
  origin: string;
  fetch?: typeof fetch;
}

export interface ApiClient {
  readonly origin: string;
  request<M extends HttpMethod, P extends PathsWith<M>>(
    method: M,
    path: P,
    ...init: Empty extends RequestInitFor<P, M> ? [RequestInitFor<P, M>?] : [RequestInitFor<P, M>]
  ): Promise<ApiResult<ResponseData<P, M>>>;
}

/*
 * The same transport typed against another generated contract `T` (the Phase 2+ subsets under
 * `./generated`). Types only: one cookie session, one runtime client.
 */
type OperationIn<T, P extends keyof T, M extends HttpMethod> = T[P] extends Record<M, infer Op> ? NonNullable<Op> : never;
export type PathsWithIn<T, M extends HttpMethod> = {
  [P in keyof T]: T[P] extends Record<M, { responses: unknown }> ? P : never;
}[keyof T];
export type ResponseDataIn<T, P extends keyof T, M extends HttpMethod> = DataOf<SuccessContent<OperationIn<T, P, M>>>;
export type RequestBodyIn<T, P extends keyof T, M extends HttpMethod> = JsonBody<OperationIn<T, P, M>>;
export type RequestInitIn<T, P extends keyof T, M extends HttpMethod> = ParamsInit<OperationIn<T, P, M>> &
  BodyInit_<OperationIn<T, P, M>> & { signal?: AbortSignal; redirect?: RequestRedirect };

export interface ApiClientFor<T> {
  readonly origin: string;
  request<M extends HttpMethod, P extends PathsWithIn<T, M>>(
    method: M,
    path: P,
    ...init: Empty extends RequestInitIn<T, P, M> ? [RequestInitIn<T, P, M>?] : [RequestInitIn<T, P, M>]
  ): Promise<ApiResult<ResponseDataIn<T, P, M>>>;
}

export const typedAs = <T>(client: ApiClient): ApiClientFor<T> => client as unknown as ApiClientFor<T>;

export function buildUrl(origin: string, path: string, pathParams?: object, query?: object): string {
  const filled = path.replace(/\{([^}]+)\}/g, (_, name: string) => {
    const value = (pathParams as Record<string, unknown> | undefined)?.[name];
    if (value === undefined || value === null || value === "") throw new TypeError(`Missing path parameter "${name}" for ${path}`);
    return encodeURIComponent(String(value));
  });
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null) continue;
    for (const item of Array.isArray(value) ? value : [value]) search.append(key, String(item));
  }
  const qs = search.toString();
  return `${origin.replace(/\/+$/, "")}${filled}${qs ? `?${qs}` : ""}`;
}

function isRawBody(body: unknown): body is RawBody {
  return body instanceof Blob || body instanceof ArrayBuffer || body instanceof Uint8Array;
}

function isJsonMedia(contentType: string | null) {
  return !!contentType && /^application\/([\w.+-]*\+)?json\b/i.test(contentType);
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function createApiClient({ origin, fetch: fetchImpl }: ApiClientOptions): ApiClient {
  const doFetch = fetchImpl ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));

  async function request(method: HttpMethod, path: string, init: Record<string, unknown> = {}) {
    const { path: pathParams, query, header, body, signal, redirect } = init as {
      path?: object;
      query?: object;
      header?: Record<string, string | undefined>;
      body?: unknown;
      signal?: AbortSignal;
      redirect?: RequestRedirect;
    };

    const headers = new Headers();
    for (const [key, value] of Object.entries(header ?? {})) {
      if (value !== undefined && key.toLowerCase() !== "origin") headers.set(key, value);
    }

    let payload: BodyInit | undefined;
    if (body !== undefined) {
      if (isRawBody(body)) {
        payload = body as BodyInit;
        if (!headers.has("Content-Type")) headers.set("Content-Type", "application/octet-stream");
      } else {
        payload = JSON.stringify(body);
        headers.set("Content-Type", "application/json");
      }
    }

    let response: Response;
    try {
      response = await doFetch(buildUrl(origin, path, pathParams, query), {
        method: method.toUpperCase(),
        headers,
        body: payload,
        credentials: "include",
        cache: "no-store",
        redirect: redirect ?? "follow",
        signal,
      });
    } catch (error) {
      if (isAbortError(error)) throw error;
      throw new ApiNetworkError(error);
    }

    const etag = response.headers.get("ETag") ?? undefined;
    const requestId = response.headers.get("X-Request-Id") ?? undefined;
    const contentType = response.headers.get("Content-Type");

    // "manual" redirects surface as opaqueredirect (status 0) or a 3xx; hand them back as-is.
    if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
      return { data: undefined, status: response.status, etag, requestId, headers: response.headers };
    }

    if (!response.ok) {
      const envelope = isJsonMedia(contentType) ? parseErrorEnvelope(await readJson(response)) : undefined;
      throw new ApiHttpError(response.status, envelope, requestId);
    }

    let data: unknown;
    if (response.status === 204 || response.status === 205 || method === "head") {
      data = undefined;
    } else if (isJsonMedia(contentType)) {
      const text = await response.text();
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        throw new ApiResponseError(response.status, "Malformed JSON response");
      }
    } else {
      // Downloads (octet-stream, text/csv) stay binary; never JSON-parse them.
      data = await response.blob();
    }
    return { data, status: response.status, etag, requestId, headers: response.headers };
  }

  return { origin, request: request as ApiClient["request"] };
}

/** A fresh key for a NEW logical mutation. Store it with the pending body and reuse it on replay. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
