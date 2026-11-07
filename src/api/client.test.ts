import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { buildUrl, createApiClient, type ResponseData } from "./client";
import { ApiHttpError, ApiNetworkError, ApiResponseError } from "./errors";

const REQUEST_ID = "6f1c2b8e-3d4a-4b5c-9d6e-7f8091a2b3c4";

function json(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status: 200, ...init, headers });
}

function setup(response: Response | (() => Promise<Response>)) {
  const fetchMock = vi.fn<typeof fetch>(async () => (typeof response === "function" ? response() : response));
  const client = createApiClient({ origin: "http://api.test/", fetch: fetchMock });
  const call = () => {
    const [url, init] = fetchMock.mock.calls[0]!;
    return { url: String(url), init: init!, headers: new Headers(init!.headers) };
  };
  return { client, fetchMock, call };
}

describe("buildUrl", () => {
  it("fills encoded path params, skips empty query values and repeats arrays", () => {
    expect(buildUrl("http://api.test/", "/api/v1/tasks/{id}", { id: "a/b" }, { a: undefined, s: ["x", "y"], n: 2 })).toBe(
      "http://api.test/api/v1/tasks/a%2Fb?s=x&s=y&n=2",
    );
  });

  it("keeps a same-origin relative path and does not double-prefix /api/v1", () => {
    expect(buildUrl("", "/api/v1/me")).toBe("/api/v1/me");
  });

  it("refuses a missing path parameter", () => {
    expect(() => buildUrl("", "/api/v1/tasks/{id}", {})).toThrow(/Missing path parameter "id"/);
  });
});

describe("createApiClient", () => {
  it("sends cookie-session, no-store requests without Origin or Authorization", async () => {
    const { client, call } = setup(json(null));
    await client.request("get", "/api/v1/auth/get-session");
    const { url, init, headers } = call();
    expect(url).toBe("http://api.test/api/v1/auth/get-session");
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("include");
    expect(init.cache).toBe("no-store");
    expect(headers.has("Origin")).toBe(false);
    expect(headers.has("Authorization")).toBe(false);
    expect(headers.has("Content-Type")).toBe(false);
  });

  it("serialises JSON bodies, forwards contract headers, drops Origin and keeps ETag quotes", async () => {
    const { client, call } = setup(json({}, { headers: { ETag: '"r-7"', "X-Request-Id": REQUEST_ID } }));
    const result = await client.request("patch", "/api/v1/tasks/{id}", {
      path: { id: "t1" },
      header: { "If-Match": '"r-6"', Origin: "http://evil.test" } as { "If-Match": string },
      body: { title: "Plan" },
    });
    const { url, init, headers } = call();
    expect(url).toBe("http://api.test/api/v1/tasks/t1");
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe(JSON.stringify({ title: "Plan" }));
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("If-Match")).toBe('"r-6"');
    expect(headers.has("Origin")).toBe(false);
    expect(result.etag).toBe('"r-7"');
    expect(result.requestId).toBe(REQUEST_ID);
  });

  it("returns undefined for 204 and a Blob for non-JSON downloads", async () => {
    const empty = setup(new Response(null, { status: 204 }));
    expect((await empty.client.request("get", "/api/v1/auth/get-session")).data).toBeUndefined();

    const csv = setup(new Response("a,b\n1,2", { headers: { "Content-Type": "text/csv" } }));
    const { data } = await csv.client.request("get", "/api/v1/finance/export", { query: { from: "2026-11-01", to: "2026-11-30" } });
    expect(data).toBeInstanceOf(Blob);
    expect(await (data as Blob).text()).toBe("a,b\n1,2");
  });

  it("maps the documented error envelope to ApiHttpError", async () => {
    const body = { error: { code: "CONFLICT", message: "stale", requestId: REQUEST_ID, details: [{ path: "title", code: "x" }] } };
    const { client } = setup(json(body, { status: 409 }));
    const error = await client.request("get", "/api/v1/auth/get-session").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiHttpError);
    const http = error as ApiHttpError;
    expect([http.status, http.code, http.requestId, http.isConflict]).toEqual([409, "CONFLICT", REQUEST_ID, true]);
    expect(http.details).toEqual([{ path: "title", code: "x" }]);
  });

  it("still raises ApiHttpError for a non-envelope error page, using the header request id", async () => {
    const { client } = setup(new Response("<html>bad gateway</html>", { status: 502, headers: { "X-Request-Id": REQUEST_ID } }));
    const error = (await client.request("get", "/api/v1/auth/get-session").catch((e: unknown) => e)) as ApiHttpError;
    expect(error).toBeInstanceOf(ApiHttpError);
    expect([error.status, error.code, error.requestId]).toEqual([502, undefined, REQUEST_ID]);
  });

  it("wraps transport failures as ApiNetworkError but lets aborts through", async () => {
    const offline = setup(() => Promise.reject(new TypeError("Failed to fetch")));
    await expect(offline.client.request("get", "/api/v1/auth/get-session")).rejects.toBeInstanceOf(ApiNetworkError);

    const aborted = setup(() => Promise.reject(new DOMException("aborted", "AbortError")));
    await expect(aborted.client.request("get", "/api/v1/auth/get-session")).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects malformed JSON on a success status", async () => {
    const { client } = setup(new Response("{oops", { headers: { "Content-Type": "application/json" } }));
    await expect(client.request("get", "/api/v1/auth/get-session")).rejects.toBeInstanceOf(ApiResponseError);
  });

  it("hands manual redirects back without parsing", async () => {
    const { client, call } = setup(new Response(null, { status: 302, headers: { Location: "/x" } }));
    const result = await client.request("get", "/api/v1/auth/get-session", { redirect: "manual" });
    expect(call().init.redirect).toBe("manual");
    expect([result.status, result.data]).toEqual([302, undefined]);
  });
});

describe("generated contract typing", () => {
  it("derives params, bodies and payloads from the OpenAPI operations", () => {
    const client = createApiClient({ origin: "" });
    type PatchInit = Parameters<typeof client.request<"patch", "/api/v1/tasks/{id}">>[2];
    expectTypeOf<ResponseData<"/api/v1/auth/get-session", "get">>().not.toBeAny();
    // JSON-or-CSV export resolves to the JSON payload or a Blob.
    expectTypeOf<Blob>().toExtend<ResponseData<"/api/v1/finance/export", "get">>();
    // Session probe payload is session/user or null.
    expectTypeOf<ResponseData<"/api/v1/auth/get-session", "get">>().toExtend<{ user: { email: string } } | null>();
    // Required path id + If-Match + body on a revisioned mutation; Origin is never part of the typed headers.
    expectTypeOf<PatchInit>().toExtend<{
      path: { id: string };
      header: { "If-Match": string };
    }>();
    expectTypeOf<NonNullable<PatchInit>["header"]>().not.toHaveProperty("Origin");

    // @ts-expect-error -- unknown route
    void (() => client.request("get", "/api/v1/not-a-route"));
    // @ts-expect-error -- method not declared for this path
    void (() => client.request("put", "/api/v1/auth/get-session"));
    // @ts-expect-error -- missing required path/header/body
    void (() => client.request("patch", "/api/v1/tasks/{id}"));
  });
});
