import { describe, expect, it } from "vitest";
import { createApiClient } from "./client";
import { probeSession } from "./session";

/* Live smoke against a running backend: API_LIVE_ORIGIN=http://localhost:3000 npx vitest run src/api/session.live.test.ts */
const origin = process.env.API_LIVE_ORIGIN;

describe.skipIf(!origin)("live session probe", () => {
  it("reports no session for a cookie-less request", async () => {
    const client = createApiClient({ origin: origin! });
    const health = await fetch(`${origin}/health/live`);
    expect(health.status).toBe(200);
    expect(await probeSession(client)).toBeNull();
  });
});
