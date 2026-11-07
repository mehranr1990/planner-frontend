import { describe, expect, it } from "vitest";
import { createApiClient } from "@/api/client";
import { createApiTasksRepository } from "./api-tasks-repository";

/*
 * Phase 02 live check (skipped unless configured), same env as the Phase 01 live test:
 *   API_LIVE_ORIGIN API_LIVE_TRUSTED_ORIGIN API_LIVE_EMAIL API_LIVE_PASSWORD
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

describe.skipIf(!origin || !trusted || !email || !password)("live recurrence + bulk", () => {
  it("repeat weekly → occurrences → complete one → stop after this one; bulk priority", { timeout: 90_000 }, async () => {
    const client = liveClient();
    await client.request("post", "/api/v1/auth/sign-in/email", { body: { email: email!, password: password! } });
    const today = "2026-10-13";
    const adapter = () => createApiTasksRepository(client, { today: () => today, fallback: { listAreas: async () => [] } });
    const repo = adapter();
    const title = `P02 weekly ${Date.now()}`;

    const shown = await repo.create({ title, date: today, recurring: true, durationMinutes: 20 });
    expect(shown).toMatchObject({ title, date: today, recurring: true });

    // Reload: two materialized occurrences (today + next week), both flagged; a second load does not duplicate.
    const mine = async () => (await adapter().list({ view: "all" })).filter((task) => task.title === title);
    const first = await mine();
    expect(first.map((task) => [task.date, task.recurring])).toEqual([[today, true], ["2026-10-20", true]]);
    expect(await mine()).toHaveLength(2);

    // Completing an occurrence task completes its occurrence too.
    await repo.setDone(shown.id, true);
    const all = (await client.request("get", "/api/v1/task-recurrences", { query: { limit: "100" } })).data.items;
    const states = await Promise.all(
      all.map(async (item) =>
        (await client.request("get", "/api/v1/task-recurrences/{id}/occurrences", { path: { id: item.id } })).data.items.find(
          (o) => o.taskId === shown.id,
        )?.state,
      ),
    );
    expect(states.filter(Boolean)).toEqual(["DONE"]);

    // Stop after the next occurrence: it stays, nothing after it repeats.
    const next = first.find((task) => task.date === "2026-10-20")!;
    const stopped = await repo.update(next.id, { recurring: false });
    expect(stopped.id).toBe(next.id);
    expect(stopped.recurring).toBeFalsy();
    const after = await mine();
    expect(after.map((task) => task.date)).toEqual([today, "2026-10-20"]);
    // 13 Oct still has a next occurrence (20 Oct); 20 Oct is the last one.
    expect(after.map((task) => !!task.recurring)).toEqual([true, false]);

    // Bulk: one request for both occurrence tasks.
    const updated = await repo.bulkUpdate(after.map((task) => task.id), { priority: "urgent" });
    expect(updated.map((task) => task.priority)).toEqual(["urgent", "urgent"]);
    expect((await mine()).every((task) => task.priority === "urgent")).toBe(true);

    await repo.remove(after.map((task) => task.id));
  });
});
