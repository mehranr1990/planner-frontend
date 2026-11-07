import { describe, expect, it } from "vitest";
import { createApiClient } from "@/api/client";
import { ApiHttpError } from "@/api/errors";
import { createApiTasksRepository } from "./api-tasks-repository";

/*
 * Phase 01 live check of the tasks adapter (skipped unless configured):
 *   API_LIVE_ORIGIN=http://localhost:3000 API_LIVE_TRUSTED_ORIGIN=http://localhost:3001 \
 *   API_LIVE_EMAIL=… API_LIVE_PASSWORD=… npx vitest run src/data/api/api-tasks-repository.live.test.ts
 * Uses an existing verified account; Node sends the trusted Origin and keeps the cookies.
 */
const origin = process.env.API_LIVE_ORIGIN;
const trusted = process.env.API_LIVE_TRUSTED_ORIGIN;
const email = process.env.API_LIVE_EMAIL;
const password = process.env.API_LIVE_PASSWORD;

function liveClient() {
  const cookies = new Map<string, string>();
  const jarFetch: typeof fetch = async (input, init = {}) => {
    const headers: Record<string, string> = Object.fromEntries(new Headers(init.headers));
    headers.Origin = trusted!;
    if (cookies.size) headers.Cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    const response = await fetch(input, { ...init, headers });
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const index = pair!.indexOf("=");
      cookies.set(pair!.slice(0, index).trim(), pair!.slice(index + 1));
    }
    return response;
  };
  return createApiClient({ origin: origin!, fetch: jarFetch });
}

describe.skipIf(!origin || !trusted || !email || !password)("live tasks adapter", () => {
  it("create → list → edit → labels → checklist → 409 recovery → complete/reopen → delete/restore", { timeout: 60_000 }, async () => {
    const client = liveClient();
    await client.request("post", "/api/v1/auth/sign-in/email", { body: { email: email!, password: password! } });
    const today = "2026-11-03";
    const repo = createApiTasksRepository(client, { today: () => today, fallback: { listAreas: async () => [] } });
    const title = `P01 live ${Date.now()}`;

    const created = await repo.create({ title, date: today, time: "09:30", priority: "high", deadline: "2026-11-05", labels: ["P01"], durationMinutes: 25 });
    expect(created).toMatchObject({ title, date: today, time: "09:30", priority: "high", deadline: "2026-11-05", labels: ["P01"] });

    // A fresh adapter (= reload) sees the persisted values.
    const reload = () => createApiTasksRepository(client, { today: () => today, fallback: { listAreas: async () => [] } });
    const listed = (await reload().list({ view: "today" })).find((task) => task.id === created.id);
    expect(listed).toMatchObject({ title, time: "09:30", priority: "high", labels: ["P01"], durationMinutes: 25 });
    expect((await reload().counts()).today).toBeGreaterThanOrEqual(1);

    const edited = await repo.update(created.id, {
      title: `${title} edited`,
      date: "2026-11-04",
      description: "**notes**",
      labels: ["P01b"],
      checklist: [{ title: "one", done: false }, { title: "two", done: true }],
    });
    expect(edited).toMatchObject({ date: "2026-11-04", time: "09:30", description: "**notes**", labels: ["P01b"], subtasks: { done: 1, total: 2 } });
    const detail = await reload().get(created.id);
    expect(detail?.checklist?.map((item) => [item.title, item.done])).toEqual([["one", false], ["two", true]]);

    // Duration = productivity estimate; notes = server Notes by taskId; description untouched.
    await repo.update(created.id, { durationMinutes: 40 });
    await repo.addNote(created.id, "Live note\nsecond line");
    const reloaded = await reload().get(created.id);
    expect(reloaded).toMatchObject({ durationMinutes: 40, description: "**notes**" });
    expect(reloaded?.notes?.map((note) => note.body)).toEqual(["Live note\nsecond line"]);
    await expect(repo.update(created.id, { energy: "high" })).rejects.toMatchObject({ code: "unsupported" });

    // Another client writes in between: the adapter's next write gets 409, refetches and re-applies.
    const other = reload();
    await other.update(created.id, { priority: "low" });
    const recovered = await repo.update(created.id, { title: `${title} after conflict` });
    expect(recovered.title).toBe(`${title} after conflict`);
    expect(recovered.priority).toBe("low");

    expect((await repo.setDone(created.id, true)).status).toBe("done");
    expect((await reload().list({ view: "completed" })).some((task) => task.id === created.id)).toBe(true);
    expect((await repo.setDone(created.id, false)).status).toBe("open");

    const { restore } = await repo.remove([created.id]);
    expect((await reload().list({ view: "all" })).some((task) => task.id === created.id)).toBe(false);
    await repo.restore(restore);
    expect((await reload().get(created.id))?.title).toBe(`${title} after conflict`);

    // Clean up: leave it soft-deleted.
    await repo.remove([created.id]);
    await expect(client.request("get", "/api/v1/tasks/{id}", { path: { id: created.id } })).rejects.toBeInstanceOf(ApiHttpError);
  });
});
