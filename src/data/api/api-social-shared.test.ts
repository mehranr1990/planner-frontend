import { describe, expect, it } from "vitest";
import { ApiHttpError } from "@/api/errors";
import { SocialError } from "../social-repositories";
import { call, currencyFromApi, currencyToApi, Intents, minorFromApi, minorToApi, Revisions, wallClock, zonedInstant } from "./api-social-shared";

const http = (status: number, code = "X", retryAfter?: string, detail?: string) =>
  new ApiHttpError(status, { error: { code, message: "x", requestId: "r", ...(detail ? { details: [{ code: detail, path: [], message: "x" }] } : {}) } } as never, "r", retryAfter);

describe("api-social-shared", () => {
  it("money: exact minor-unit strings ⇄ safe integers, never floats", () => {
    expect(minorFromApi("1999")).toBe(1999);
    expect(minorFromApi("-150000")).toBe(-150000);
    expect(minorToApi(1999)).toBe("1999");
    expect(() => minorFromApi("19.99")).toThrow(SocialError);
    expect(() => minorFromApi("9007199254740993")).toThrow(SocialError);
    expect(() => minorToApi(0.1 + 0.2)).toThrow(SocialError);
  });

  it("currencies: ISO with the server scale; Toman is never sent", () => {
    expect(currencyFromApi("IRR", 2)).toBe("irr");
    expect(() => currencyFromApi("IRR", 0)).toThrow(SocialError);
    expect(() => currencyFromApi("JPY")).toThrow(SocialError);
    expect(currencyToApi("eur")).toBe("EUR");
    expect(() => currencyToApi("toman")).toThrow(SocialError);
  });

  it("errors: status → code, stable reason, Retry-After seconds", async () => {
    await expect(call(() => Promise.reject(http(409, "CONFLICT", undefined, "LAST_ORGANIZER")))).rejects.toMatchObject({ code: "conflict", reason: "LAST_ORGANIZER" });
    await expect(call(() => Promise.reject(http(429, "RATE_LIMITED", "17")))).rejects.toMatchObject({ code: "rate-limited", retryAfter: 17 });
    await expect(call(() => Promise.reject(http(404)))).rejects.toMatchObject({ code: "not-found" });
    await expect(call(() => Promise.reject(http(422)))).rejects.toMatchObject({ code: "invalid" });
    const server = http(503);
    await expect(call(() => Promise.reject(server))).rejects.toBe(server);
  });

  it("intents: one key per intent across retryable failures, a new key once decided", async () => {
    const intents = new Intents();
    const keys: string[] = [];
    await expect(intents.run("x", async (k) => (keys.push(k), Promise.reject(new SocialError("rate-limited"))))).rejects.toBeTruthy();
    await expect(intents.run("x", async (k) => (keys.push(k), Promise.reject(http(503))))).rejects.toBeTruthy();
    await intents.run("x", async (k) => keys.push(k));
    await intents.run("x", async (k) => keys.push(k));
    expect(keys[0]).toBe(keys[1]);
    expect(keys[1]).toBe(keys[2]);
    expect(keys[3]).not.toBe(keys[2]);
    await expect(intents.run("y", async (k) => (keys.push(k), Promise.reject(new SocialError("invalid"))))).rejects.toBeTruthy();
    await intents.run("y", async (k) => keys.push(k));
    expect(keys.at(-1)).not.toBe(keys.at(-2));
  });

  it("revisions: a late (stale) read never lowers a newer revision", () => {
    const r = new Revisions();
    r.put("a", 5);
    r.put("a", 3);
    expect(r.get("a")).toBe(5);
    r.set("a", 2);
    expect(r.get("a")).toBe(2);
    r.put("g:1", 1);
    r.put("g:1:job", 1);
    r.drop("g:1");
    expect(r.get("g:1:job")).toBeUndefined();
  });

  it("time: wall clock in the IANA zone ⇄ Gregorian instants", () => {
    expect(zonedInstant("2026-11-20", "09:30", "Asia/Tehran")).toBe("2026-11-20T06:00:00.000Z");
    expect(wallClock("2026-11-20T06:00:00.000Z", "Asia/Tehran")).toEqual({ day: "2026-11-20", time: "09:30" });
    expect(zonedInstant("2026-07-01", "12:00", "Europe/Berlin")).toBe("2026-07-01T10:00:00.000Z");
  });
});
