import { describe, expect, it } from "vitest";
import { newIdempotencyKey } from "@/api/client";
import { ApiHttpError } from "@/api/errors";
import { RepositoryError } from "../repositories";
import { createApiProjectRepositories } from "./api-project-repositories";
import { accessMe, projectsClient } from "./api-project-shared";
import { liveConfigured, liveSession } from "./live-support";

/*
 * Env-gated live check of the Projects wiring against the local backend
 * (Shared local test mode, `mehran_dev`) and the dedicated development
 * account — never production. One sign-in for the whole run. Every project it
 * creates is archived at the end. File content (upload / download / versions)
 * is blocked by the local test mode (ADR 0057) and is recorded, not asserted.
 * Rate limits (ADR 0058, per actor per clock minute and module family): reads
 * 600, writes 120, sensitive 20, expensive routes an extra 30 each. Requests go
 * out unpaced, as the app sends them; every request is counted and every 429
 * is recorded with its Retry-After and failed, never retried silently.
 * `LIVE_PER_MINUTE` re-enables the old pacing for diagnosis only.
 */

const PER_MINUTE = Number(process.env.LIVE_PER_MINUTE ?? 0);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const toNextMinute = () => 61_000 - (Date.now() % 60_000);
type Traffic = { requests: number; byMinute: Record<string, number>; limited: string[]; tightest: string };
function paceFetch(traffic: Traffic = { requests: 0, byMinute: {}, limited: [], tightest: "" }) {
  const real = globalThis.fetch;
  let window = Math.floor(Date.now() / 60_000);
  let used = 0;
  let lowest = Infinity;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const route = `${init?.method ?? "GET"} ${url.pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ":id")}`;
    const now = Math.floor(Date.now() / 60_000);
    if (now !== window) [window, used] = [now, 0];
    if (PER_MINUTE && used >= PER_MINUTE) {
      await sleep(toNextMinute());
      [window, used] = [Math.floor(Date.now() / 60_000), 0];
    }
    used += 1;
    const response = await real(input, init);
    if (url.pathname.startsWith("/api/v1/auth/")) return response;
    traffic.requests += 1;
    traffic.byMinute[new Date(window * 60_000).toISOString().slice(11, 16)] = used;
    const remaining = Number(response.headers.get("RateLimit-Remaining") ?? NaN);
    const limit = Number(response.headers.get("RateLimit-Limit") ?? NaN);
    if (remaining / limit < lowest) {
      lowest = remaining / limit;
      traffic.tightest = `${route} ${remaining}/${limit} policy ${response.headers.get("RateLimit-Policy")}`;
    }
    if (response.status === 429) traffic.limited.push(`${route} Retry-After ${response.headers.get("Retry-After")} policy ${response.headers.get("RateLimit-Policy")}`);
    return response;
  };
  return () => {
    globalThis.fetch = real;
  };
}

type Step = { step: string; result: string };
const log: Step[] = [];
const record = (step: string, result: string) => log.push({ step, result });
/** Printed, and appended to `LIVE_REPORT` when set (passing tests' console output is hidden). */
async function report(title: string, value: unknown) {
  const line = `${title} ${JSON.stringify(value)}\n`;
  console.log(line);
  if (process.env.LIVE_REPORT) (await import("node:fs")).appendFileSync(process.env.LIVE_REPORT, line);
}

/** Runs a step; a refusal / HTTP error is recorded with its status or code and rethrown. */
async function step<T>(name: string, run: () => Promise<T>): Promise<T> {
  try {
    const value = await run();
    record(name, "PASS");
    return value;
  } catch (error) {
    const detail = error instanceof ApiHttpError ? `HTTP ${error.status} ${error.code ?? ""}` : error instanceof RepositoryError ? `${error.code}: ${error.message}` : String(error);
    record(name, `FAIL ${detail}`);
    throw error;
  }
}

describe.skipIf(!liveConfigured)("Projects completion (live)", () => {
  it("create (Blank / Kanban / Scrum) → tasks, assignments, drafts, members, invitations, structure, risks, reports → archive", async () => {
    const traffic: Traffic = { requests: 0, byMinute: {}, limited: [], tightest: "" };
    const restoreFetch = paceFetch(traffic);
    const { client, today, end } = await liveSession();
    const repos = createApiProjectRepositories(client, { today: () => today });
    const api = projectsClient(client);
    const created: string[] = [];
    const suffix = Date.now().toString(36).slice(-4).toUpperCase();
    try {
      // ── Creation: the three catalogue templates, keys unique per owner ──
      const kanban = await step("create Kanban", () =>
        repos.projectCreate.create({ name: `Live K ${suffix}`, key: `K${suffix}`, startDate: today, endDate: today, template: "kanban", attemptId: crypto.randomUUID() }),
      );
      created.push(kanban.id);
      const blank = await step("create Blank", () => repos.projectCreate.create({ name: `Live B ${suffix}`, key: `B${suffix}`, startDate: today, endDate: today, template: "blank", attemptId: crypto.randomUUID() }));
      created.push(blank.id);
      const scrum = await step("create Scrum", () => repos.projectCreate.create({ name: `Live S ${suffix}`, key: `S${suffix}`, startDate: today, endDate: today, template: "scrum", attemptId: crypto.randomUUID() }));
      created.push(scrum.id);
      expect(kanban.key).toBe(`K${suffix}`);
      await step("duplicate key → key-taken (PROJECT_KEY_CONFLICT)", () =>
        expect(repos.projectCreate.create({ name: "Dup", key: `K${suffix}`, startDate: today, endDate: today, template: "blank", attemptId: crypto.randomUUID() })).rejects.toMatchObject({ message: "key-taken" }),
      );
      const id = kanban.id;

      // ── Settings / access ──
      const access = await step("access gate + capabilities", () => repos.projects.access(id));
      expect(access.status).toBe("ok");
      await step("settings update (name, dates)", () => repos.settings.update(id, { name: `Live K ${suffix} edited`, endDate: today }));
      await step("settings key collision → key-taken", () => expect(repos.settings.update(id, { key: `B${suffix}` })).rejects.toMatchObject({ message: "key-taken" }));
      await step("members list", async () => expect((await repos.members.list(id)).length).toBeGreaterThan(0));

      // ── Invitations (inviter side; recipient is a reserved test domain) ──
      const [sent] = await step("invite send", () => repos.memberInvites.send(id, [`live-${suffix.toLowerCase()}@example.test`], "member"));
      await step("pending list", async () => expect((await repos.memberInvites.listPending(id)).some((invite) => invite.id === sent!.id)).toBe(true));
      await step("resend", () => repos.memberInvites.resend(id, sent!.id));
      await step("cancel (revoke)", () => repos.memberInvites.cancel(id, sent!.id));

      // ── Tasks: create, child, subtask toggle, order, assignments ──
      const phases = await step("phases (structure progress)", () => repos.milestones.listPhases(id));
      const raw = (title: string, parentTaskId?: string) =>
        api
          .request("post", "/api/v1/projects/{id}/tasks", { path: { id }, header: { "Idempotency-Key": newIdempotencyKey() }, body: { id: crypto.randomUUID(), title, ...(parentTaskId ? { parentTaskId } : {}) } })
          .then((response) => response.data);
      const parent = phases[0] ? await step("task create (seam)", () => repos.projectTasks.create(id, { title: "Parent", phaseId: phases[0]!.id })) : await step("task create (no phase)", () => raw("Parent"));
      const sibling = await step("task create (raw)", () => raw("Sibling"));
      const child = await step("child task (parentTaskId)", () => raw("Child", parent.id));
      await step("detail subtasks", async () => expect((await repos.taskDetails.get(id, parent.id)).subtasks).toEqual([{ id: child.id, title: "Child", done: false }]));
      await step("subtask toggle → DONE", async () => expect((await repos.taskDetails.toggleSubtask(id, parent.id, child.id)).subtasks[0]!.done).toBe(true));
      await step("row subtask count", async () => expect((await repos.projectTasks.get(id, parent.id)).subtasks).toEqual({ done: 1, total: 1 }));
      await step("list row subtask count (LIST parentTaskId)", async () =>
        expect((await repos.projectTasks.list(id)).tasks.find((task) => task.id === parent.id)?.subtasks).toEqual({ done: 1, total: 1 }),
      );
      await step("delete parent with live child → refused", () => expect(repos.projectTasks.remove(id, [parent.id])).rejects.toMatchObject({ code: "invalid" }));
      const order = (await repos.projectTasks.list(id)).tasks.map((task) => task.id).filter((taskId) => taskId === parent.id || taskId === sibling.id);
      await step("reorder (same section)", async () => {
        await repos.projectTasks.reorder(id, [...order].reverse());
        const after = (await repos.projectTasks.list(id)).tasks.map((task) => task.id).filter((taskId) => taskId === parent.id || taskId === sibling.id);
        expect(after).toEqual([...order].reverse());
      });

      const me = await accessMe(api, id);
      const sib = await repos.projectTasks.get(id, sibling.id);
      await step("assign self (pending)", () => repos.projectTasks.update(id, sibling.id, { assigneeIds: [me.accessId] }, sib.revision));
      // One account: the only pending assignee is the caller, whom the server never reminds.
      await step("remind (self only → nothing to remind)", () => expect(repos.assignments.remind(id, sibling.id)).rejects.toMatchObject({ code: "invalid" }));
      const pending = await repos.projectTasks.get(id, sibling.id);
      await step("accept", () => repos.assignments.accept(id, sibling.id, pending.revision));
      const accepted = await repos.projectTasks.get(id, sibling.id);
      await step("revert accept → pending", async () => {
        const reverted = await repos.assignments.revertAccept(id, sibling.id, accepted.revision);
        expect(reverted.assignees.some((assignee) => assignee.person.id === me.accessId && assignee.state === "pending")).toBe(true);
      });
      await step("my assignments", async () => expect((await repos.assignments.listMine(id)).pending.some((task) => task.id === sibling.id)).toBe(true));

      // ── Workflow draft → publish ──
      const workflow = await step("published workflow", () => repos.workflows.published(id));
      await step("draft save", () => repos.workflowDrafts.saveDraft(id, { statuses: workflow.statuses, transitions: workflow.transitions }));
      const preview = await step("publish preview", () => repos.workflowDrafts.previewPublish(id));
      record("preview removed / pinned", JSON.stringify(preview.removed.map((entry) => entry.tasks)));
      await step("publish (tasks keep their version)", () => repos.workflowDrafts.publish(id, {}));
      await step("no open draft after publish", async () => expect(await repos.workflowDrafts.draft(id)).toBeNull());
      await step("draft save + discard", async () => {
        const next = await repos.workflows.published(id);
        await repos.workflowDrafts.saveDraft(id, { statuses: next.statuses, transitions: next.transitions });
        await repos.workflowDrafts.discardDraft(id);
        expect(await repos.workflowDrafts.draft(id)).toBeNull();
      });

      // ── Milestones, activity ──
      await step("milestone create (raw) + rename (seam)", async () => {
        await api.request("post", "/api/v1/projects/{id}/components/{kind}", {
          path: { id, kind: "milestones" },
          header: { "Idempotency-Key": newIdempotencyKey() },
          body: { id: crypto.randomUUID(), title: "Beta", targetDate: today },
        });
        const milestone = (await repos.milestones.listMilestones(id))[0]!;
        expect(milestone.tasksLeft).not.toBeUndefined();
        await repos.milestones.updateMilestone(id, milestone.id, { title: "Beta 2" }, milestone.revision ?? 0);
      });
      await step("milestone rows", () => repos.milestones.milestoneRows(id));
      await step("activity", async () => record("activity lines", String((await repos.activity.list(id, { limit: 20 })).length)));

      // ── Risks → issue ──
      const riskId = crypto.randomUUID();
      await step("risk create (raw)", () =>
        api.request("post", "/api/v1/projects/{projectId}/register-items", {
          path: { projectId: id },
          header: { "Idempotency-Key": newIdempotencyKey() },
          body: { id: riskId, kind: "RISK", title: "Vendor late", description: "", severity: "HIGH", probability: 60, owner: null, mitigation: "", status: "OPEN" },
        }),
      );
      const risk = await step("risk get (code)", () => repos.risks.get(id, riskId));
      record("risk code", String(risk.code));
      await step("risk comment add + list", async () => {
        await repos.risks.addComment(id, riskId, "Live check");
        expect((await repos.risks.comments(id, riskId)).some((comment) => comment.body === "Live check")).toBe(true);
      });
      const issue = await step("convert → issue", () => repos.risks.convert(id, riskId, risk.revision));
      expect(issue.kind).toBe("issue");
      const source = await repos.risks.get(id, riskId);
      await step("close risk with reason", async () => expect((await repos.risks.close(id, riskId, { reason: "became-issue", note: "Live" }, source.revision)).closeReason).toBe("became-issue"));
      await step("resolve issue", () => repos.risks.resolve(id, issue.id, "Fixed", issue.revision));
      await step("risk history", () => repos.risks.history(id, riskId));

      // ── Reports / workload ──
      await step("analytics summary", () => repos.reports.summary(id, { range: "4w", weekStartsOn: 6 }));
      await step("workload grid", () => repos.workload.byWeek(id, { from: today, weeks: 1 }));
      await step("project summary KPIs", () => repos.projects.summary(id));

      // ── Files: metadata only (content blocked by the local test mode) ──
      await step("file config + library list (metadata)", async () => {
        expect((await repos.files.config(id)).maxBytes).toBeGreaterThan(0);
        await repos.files.list(id);
      });
      try {
        await repos.files.upload(id, { name: "a.pdf", sizeBytes: 8, folderId: null, file: new Blob(["%PDF-1.4"], { type: "application/pdf" }) });
        record("file upload", "ACCEPTED (unexpected in test mode)");
      } catch (error) {
        record("file upload", `POLICY-BLOCKED ${error instanceof RepositoryError ? error.code : error instanceof ApiHttpError ? error.status : "?"}`);
      }

      // ── Delete children before parents ──
      await step("delete parent + child", async () => {
        await repos.projectTasks.remove(id, [parent.id, child.id]);
        expect((await repos.projectTasks.list(id)).tasks.some((task) => task.id === parent.id || task.id === child.id)).toBe(false);
      });
    } finally {
      for (const projectId of created) await step(`archive ${projectId.slice(0, 8)}`, () => repos.settings.archive(projectId)).catch(() => undefined);
      end();
      restoreFetch();
      await report("STEPS", log);
      await report("TRAFFIC full scenario", traffic);
    }
    expect(traffic.limited).toEqual([]);
  }, 1_500_000);

  it("rate limit: Projects screen loads with a representative task count, unpaced", async () => {
    const traffic: Traffic = { requests: 0, byMinute: {}, limited: [], tightest: "" };
    const restoreFetch = paceFetch(traffic);
    const { client, today, end } = await liveSession();
    const repos = createApiProjectRepositories(client, { today: () => today });
    const api = projectsClient(client);
    const suffix = Date.now().toString(36).slice(-4).toUpperCase();
    const loads: Record<string, number> = {};
    /** Requests one screen load sends (adapter calls only; React Query dedupes / caches above this). */
    const load = async (name: string, run: () => Promise<unknown>) => {
      const before = traffic.requests;
      await run();
      loads[name] = traffic.requests - before;
    };
    const project = await repos.projectCreate.create({ name: `Live R ${suffix}`, key: `R${suffix}`, startDate: today, endDate: today, template: "kanban", attemptId: crypto.randomUUID() });
    try {
      const TASKS = 24;
      for (let index = 0; index < TASKS; index += 1)
        await api.request("post", "/api/v1/projects/{id}/tasks", {
          path: { id: project.id },
          header: { "Idempotency-Key": newIdempotencyKey() },
          body: { id: crypto.randomUUID(), title: `Rate ${index + 1}` },
        });
      await load("directory (Projects home)", () => repos.projects.listAccessible());
      await load("access gate", () => repos.projects.access(project.id));
      await load("overview KPIs", () => repos.projects.summary(project.id));
      await load("task list", async () => expect((await repos.projectTasks.list(project.id)).tasks.length).toBe(TASKS));
      await load("kanban board (workflow + counts)", () => Promise.all([repos.workflows.published(project.id), repos.projectTasks.countByStatus(project.id)]));
      await load("workload grid", () => repos.workload.byWeek(project.id, { from: today, weeks: 1 }));
      await load("analytics", () => repos.reports.summary(project.id, { range: "4w", weekStartsOn: 6 }));
      // A second visit inside the same minute (refetch on focus / navigation back).
      await load("overview + list again", () => Promise.all([repos.projects.summary(project.id), repos.projectTasks.list(project.id)]));
    } finally {
      await repos.settings.archive(project.id).catch(() => undefined);
      end();
      restoreFetch();
      await report("SCREEN LOADS", loads);
      await report("TRAFFIC screen loads", traffic);
    }
    expect(traffic.limited).toEqual([]);
  }, 600_000);

  it("file content is POLICY-BLOCKED in the local Shared test mode; metadata reads work", async () => {
    const restoreFetch = paceFetch();
    const { client, today, end } = await liveSession();
    const repos = createApiProjectRepositories(client, { today: () => today });
    const suffix = Date.now().toString(36).slice(-4).toUpperCase();
    const project = await repos.projectCreate.create({ name: `Live F ${suffix}`, key: `F${suffix}`, startDate: today, endDate: today, template: "blank", attemptId: crypto.randomUUID() });
    try {
      expect((await repos.files.config(project.id)).maxBytes).toBeGreaterThan(0);
      expect((await repos.files.list(project.id)).files).toEqual([]);
      await expect(
        repos.files.upload(project.id, { name: "a.pdf", sizeBytes: 8, folderId: null, file: new Blob(["%PDF-1.4"], { type: "application/pdf" }) }),
      ).rejects.toMatchObject({ code: "forbidden" });
    } finally {
      await repos.settings.archive(project.id);
      end();
      restoreFetch();
    }
  }, 600_000);
});
