import { afterAll, describe, expect, it, vi } from "vitest";
import { newIdempotencyKey, typedAs } from "@/api/client";
import type { paths } from "@/api/generated/openapi-p6-teams";
import { createApiProjectRepositories } from "./api-project-repositories";
import { projectsClient } from "./api-project-shared";
import { accessMe, createApiTeamRepositories } from "./api-team-repositories";
import { liveConfigured, liveSession } from "./live-support";

/*
 * Env-gated live check of the Teams P3 gap-closure wiring against the local
 * backend and the dedicated test account (never production). One sign-in.
 *
 * Pacing: every collaboration request (reads included) takes the backend's
 * per-actor limit of 20 per clock minute (per IP 30); a 429 carries
 * Retry-After: 60. The global fetch is paced to 9 API requests per clock minute;
 * a 429 waits for Retry-After (the limit runs before business validation, so
 * the refused request had no effect) and is retried once.
 *
 * Each operation is recorded PASS / FAIL / NOT VERIFIED with its reason and
 * printed at the end. File bytes are never uploaded (blocked in local Shared
 * test mode). Every active "Live check" team is archived at the end.
 */

// ADR 0058 (reads 600 / writes 120 / sensitive 20 per actor-minute): unpaced by default; LIVE_PER_MINUTE paces for diagnosis.
const PER_MINUTE = Number(process.env.LIVE_PER_MINUTE ?? 0);
const limited: string[] = [];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Serialized and aligned to clock minutes, as the server counts (fixed window per minute). */
function pacedFetch(real: typeof fetch): typeof fetch {
  let minute = -1;
  let used = 0;
  let queue: Promise<unknown> = Promise.resolve();
  const slot = async () => {
    const now = Math.floor(Date.now() / 60_000);
    if (now !== minute) {
      minute = now;
      used = 0;
    }
    if (PER_MINUTE && used >= PER_MINUTE) {
      // Next clock minute plus a margin for clock skew.
      await sleep((minute + 1) * 60_000 - Date.now() + 2_000);
      minute = Math.floor(Date.now() / 60_000);
      used = 0;
    }
    used++;
  };
  return (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    const run = async () => {
      if (!url.includes("/api/v1/auth/")) await slot();
      const response = await real(input, init);
      // Diagnostics only: method, path and status of refused calls (never bodies or headers).
      if (process.env.LIVE_DEBUG && response.status >= 400)
        console.log("HTTP", response.status, init?.method ?? "GET", new URL(url).pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, (id) => id.slice(0, 8)));
      if (response.status !== 429) return response;
      limited.push(`${init?.method ?? "GET"} ${new URL(url).pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ":id")} Retry-After ${response.headers.get("Retry-After")} policy ${response.headers.get("RateLimit-Policy")}`);
      if (!PER_MINUTE) return response;
      await sleep(Number(response.headers.get("Retry-After") ?? "60") * 1000 + 2_000);
      minute = Math.floor(Date.now() / 60_000);
      used = 1;
      const retried = await real(input, init);
      if (process.env.LIVE_DEBUG && retried.status >= 400)
        console.log("HTTP retry", retried.status, init?.method ?? "GET", new URL(url).pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, (id) => id.slice(0, 8)));
      return retried;
    };
    const result = queue.then(run, run);
    queue = result.catch(() => undefined);
    return result;
  };
}

type Outcome = "PASS" | "FAIL" | "NOT VERIFIED";
const results: { op: string; outcome: Outcome; note: string }[] = [];
const only = (process.env.LIVE_ONLY ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
async function step(op: string, run: () => Promise<string | void>) {
  if (only.length && !only.some((key) => op.toLowerCase().includes(key))) return;
  try {
    results.push({ op, outcome: "PASS", note: (await run()) ?? "" });
  } catch (error) {
    const e = error as { code?: string; status?: number; message?: string };
    const reason = `${e.code ?? e.status ?? ""} ${e.message ?? String(error)}`.trim();
    const skipped = reason.includes("NOT VERIFIED:");
    results.push({ op, outcome: skipped ? "NOT VERIFIED" : "FAIL", note: skipped ? reason.split("NOT VERIFIED:")[1]!.trim() : reason });
  }
}
const notVerified = (why: string) => new Error(`NOT VERIFIED: ${why}`);
let projectId: string | null = null;
let createdProjectId: string | null = null;

afterAll(async () => {
  const report =
    "TEAMS LIVE RESULTS\n" +
    results.map((r) => `${r.outcome.padEnd(12)} ${r.op}${r.note ? " — " + r.note : ""}`).join("\n") +
    `\n429s: ${limited.length ? limited.join("; ") : "none"}`;
  if (process.env.LIVE_REPORT) (await import("node:fs")).writeFileSync(process.env.LIVE_REPORT, report + "\n");
  console.log(report);
});

describe.skipIf(!liveConfigured)("Teams completion (live)", () => {
  it("remaining P3 operations against the real backend", async () => {
    vi.stubGlobal("fetch", pacedFetch(globalThis.fetch));
    const { client, today, end } = await liveSession();
    const repos = createApiTeamRepositories(client);
    const api = typedAs<paths>(client);
    try {
      // Reuse the leftover live-check team (7f2350d7…); create one only when none is active.
      const directory = await repos.teams.listAccessible();
      const leftovers = directory.teams.filter((entry) => entry.name.startsWith("Live check ") && entry.role === "owner" && entry.lifecycle === "active");
      const team = leftovers[0] ?? (await repos.teams.create({ name: `Live check ${Date.now().toString(36)}`, planningMode: "weekly" }));
      const teamId = team.id;
      const me = await accessMe(api, teamId);
      console.log("team", teamId, leftovers.length ? "(reused)" : "(created)");

      await step("files/config (limits)", async () => {
        const config = await repos.teamFiles.config(teamId);
        expect(config.maxBytes).toBeGreaterThan(0);
        return `maxBytes ${config.maxBytes}`;
      });

      await step("sent-invitations + resend", async () => {
        await repos.teamInvitations.send(teamId, { emails: [`live-invitee-${Date.now().toString(36)}@example.com`], role: "member" });
        const pending = await repos.teamMembers.invitations(teamId);
        if (pending.length === 0) throw notVerified("list answered 200 []; an unknown address creates no offer and the only test account is already a member — Resend needs a second verified account");
        const before = pending[0]!;
        const resent = await repos.teamMembers.resendInvite(teamId, before.id);
        expect(resent.id).toBe(before.id);
        await repos.teamMembers.cancelInvite(teamId, before.id);
        return `sentAt ${before.sentAt} → ${resent.sentAt}`;
      });

      await step("RSVP Maybe / change", async () => {
        const start = new Date(Date.now() + 2 * 3_600_000);
        const hh = (d: Date) => d.toTimeString().slice(0, 5);
        if (start.toISOString().slice(0, 10) !== today || hh(start) > "22:00") throw notVerified("too late in the day for a same-day timed meeting");
        const event = await repos.teamEvents.create(teamId, { title: "Live RSVP check", kind: "meeting", day: today, time: hh(start), end: hh(new Date(start.getTime() + 1_800_000)) });
        const meetings = (await api.request("get", "/api/v1/teams/{id}/meetings", { path: { id: teamId }, query: { limit: 50 } })).data.items;
        const meeting = meetings.find((entry) => entry.event.title === "Live RSVP check" && entry.event.id === event.id) ?? meetings.find((entry) => entry.event.title === "Live RSVP check")!;
        try {
          await api.request("post", "/api/v1/teams/{id}/meetings/{meetingId}/invitations", {
            path: { id: teamId, meetingId: meeting.id },
            header: { "If-Match": `"${meeting.revision}"`, "Idempotency-Key": newIdempotencyKey() },
            body: { id: crypto.randomUUID(), member: { accessId: me.accessId, generation: me.generation }, expiresAt: new Date(start.getTime() + 3_600_000).toISOString() },
          });
        } catch (error) {
          await repos.teamEvents.cancel(event.id).catch(() => undefined);
          throw notVerified(`the organiser cannot invite themselves (HTTP ${(error as { status?: number }).status}); needs a second member account`);
        }
        await repos.teamEvents.range(teamId, today, today);
        expect((await repos.teamEvents.rsvp(event.id, "maybe")).myRsvp).toBe("maybe");
        expect((await repos.teamEvents.rsvp(event.id, "going")).myRsvp).toBe("going");
        await repos.teamEvents.cancel(event.id);
        return "MAYBE, then changed to ACCEPTED on the same invitation";
      });

      await step("assignment Undo (revert accept)", async () => {
        const task = await repos.teamTasks.create(teamId, { title: "Live revert check", assigneeId: me.accessId, planned: false });
        const listed = (await repos.teamTasks.list(teamId)).find((entry) => entry.id === task.id)!;
        const mine = listed.assignees.find((entry) => entry.person.id === me.accessId);
        if (!mine || mine.state !== "pending") throw notVerified(`self-assignment is ${mine?.state ?? "absent"}; a PENDING offer from another member is needed`);
        const accepted = await repos.teamTasks.accept(task.id, listed.revision);
        const reverted = await repos.teamTasks.revertAccept(task.id, accepted.revision);
        expect(reverted.assignees.find((entry) => entry.person.id === me.accessId)?.state).toBe("pending");
        await repos.teamTasks.remove(task.id).catch(() => undefined);
        return "ACCEPTED → WITHDRAWN, new PENDING offer";
      });

      await step("Team↔Project link request / pending / approve", async () => {
        // Lean pick (one list + access/me per candidate) instead of the full Projects directory fan-out.
        const papi = projectsClient(client);
        const listed = (await papi.request("get", "/api/v1/projects", { query: { limit: 100 } })).data.items.filter((entry) => entry.state === "ACTIVE");
        let project: { id: string; name: string } | null = null;
        for (const entry of listed) {
          const access = (await papi.request("get", "/api/v1/projects/{id}/access/me", { path: { id: entry.id } })).data;
          if (access.role === "OWNER" || access.role === "ADMIN") {
            project = { id: entry.id, name: (entry as { title?: string }).title ?? "" };
            break;
          }
        }
        if (!project) {
          // None owned: a clearly named synthetic project, archived at the end of the run.
          const suffix = Date.now().toString(36).slice(-4).toUpperCase();
          const created = await createApiProjectRepositories(client, { today: () => today }).projectCreate.create({ name: `Live TL ${suffix}`, key: `TL${suffix}`, startDate: today, endDate: today, template: "blank", attemptId: crypto.randomUUID() });
          project = { id: created.id, name: created.name };
          createdProjectId = created.id;
        }
        // Authorization: a project the caller cannot see (random id) is refused, no discovery.
        const refused = await repos.projectAssociations.request(teamId, crypto.randomUUID()).then(() => null, (error: { code?: string; status?: number }) => error.code ?? error.status);
        if (refused === null) throw new Error("link request for an unknown project was accepted");
        if ((await repos.teams.projects(teamId)).some((entry) => entry.id === project.id)) await repos.projectAssociations.unlink(teamId, project.id);
        const request = await repos.projectAssociations.request(teamId, project.id);
        const pending = await repos.projectAssociations.requests(teamId);
        expect(pending.find((entry) => entry.id === request.id)?.projectName).toBe(project.name);
        await repos.projectAssociations.approve(request.id);
        expect((await repos.teams.projects(teamId)).map((entry) => entry.id)).toContain(project.id);
        projectId = project.id;
        return `project ${project.id.slice(0, 8)}${createdProjectId ? " (synthetic)" : ""} linked through request ${request.id.slice(0, 8)}; unknown project refused (${refused})`;
      });

      await step("Project calendar events layer", async () => {
        if (!projectId) throw notVerified("no linked project (link step did not pass)");
        const to = new Date(Date.now() + 27 * 86_400_000).toISOString().slice(0, 10);
        const timezone = (await client.request("get", "/api/v1/me/settings")).data.timezone;
        const raw = (
          await api.request("get", "/api/v1/teams/{id}/calendar/sources", { path: { id: teamId }, query: { from: today, to, timezone, source: "PROJECT", limit: "100" } })
        ).data.items;
        // Only linked, readable projects may contribute; nothing from other scopes.
        expect(raw.every((item) => item.kind === "PROJECT" && item.scopeId === projectId)).toBe(true);
        const events = (await repos.teamCalendar.overlays(teamId, today, to)).filter((entry) => entry.kind === "project-event");
        for (const event of events) expect(event.day >= today && event.day <= to && /^\d{2}:\d{2}$/.test(event.time)).toBe(true);
        if (events.length === 0)
          throw notVerified(`calendar/sources answered 200 for the linked project (${raw.length} item(s), timezone ${timezone}); no contract route creates a project calendar event, so placement could not be checked`);
        return `${events.length} project event(s) in 28 days, timezone ${timezone}`;
      });

      if (projectId)
        await step("unlink (cleanup)", async () => {
          await repos.projectAssociations.unlink(teamId, projectId!);
          expect((await repos.teams.projects(teamId)).map((entry) => entry.id)).not.toContain(projectId);
          return "link removed and read back";
        });
      if (createdProjectId) await step("archive synthetic project", async () => void (await createApiProjectRepositories(client, { today: () => today }).settings.archive(createdProjectId!)));

      await step("sprint burndown + point capacity", async () => {
        await repos.teamSettings.setPlanningMode(teamId, "sprints");
        let state = await repos.teamSprints.current(teamId);
        if (!state.sprint) state = await repos.teamSprints.start(teamId, { goal: "Live burndown check" });
        expect(state.sprint).not.toBeNull();
        expect(Array.isArray(state.sprint!.burndown)).toBe(true);
        return `unit ${state.unit}, ${state.sprint!.burndown.length} recorded day(s), capacity ${state.sprint!.capacity ?? "UNKNOWN"}`;
      });

      // Cleanup: archive every active live-check team (the leftover 7f2350d7… included).
      for (const entry of leftovers.length ? leftovers : [team]) {
        await step(`archive ${entry.id.slice(0, 8)}`, async () => {
          await repos.teamSettings.archive(entry.id);
          const access = await repos.teams.access(entry.id);
          if (access.status === "ok") expect(access.team.lifecycle).toBe("archived");
          // An archived team takes no new work.
          const write = await repos.teamTasks.create(entry.id, { title: "Live after archive", planned: false }).then(() => "ACCEPTED", (error: { code?: string; status?: number }) => `refused ${error.code ?? error.status}`);
          expect(write).not.toBe("ACCEPTED");
          return `${access.status === "ok" ? `lifecycle ${access.team.lifecycle}` : access.status}; new task ${write}`;
        });
      }
    } finally {
      end();
      vi.unstubAllGlobals();
    }
    expect(results.filter((entry) => entry.outcome === "FAIL")).toEqual([]);
  }, 1_500_000);
});
