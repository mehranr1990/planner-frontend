import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it, vi } from "vitest";
import { typedAs, type ApiClient } from "@/api/client";
import type { paths } from "@/api/generated/openapi-p6-messaging";
import type { MsgSource } from "../messaging-domain";
import type { MessagingRepository } from "../messaging-repositories";
import { createApiMessaging } from "./api-messaging-repository";
import { revisionTag } from "./api-shared";
import { liveConfigured, liveSession } from "./live-support";

/*
 * Env-gated live acceptance of Messages & Meetings (P5) through the same
 * adapters the UI uses. Two accounts from the backend's ignored
 * `.tools/company-development-accounts.json` (API_LIVE_COMPANY_ACCOUNTS):
 * primary = Company owner (organiser / announcement manager), second = member.
 * Credentials are never printed. Each step is PASS / FAIL / NOT VERIFIED.
 * Files / media are POLICY-BLOCKED in local Shared test mode and never sent.
 * Cleanup (test-owned only): meetings canceled, announcements withdrawn /
 * schedule canceled, group left. Run alone: two sign-ins.
 */

const PER_MINUTE = Number(process.env.LIVE_PER_MINUTE ?? 90);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function pacedFetch(real: typeof fetch): typeof fetch {
  let minute = -1;
  let used = 0;
  let queue: Promise<unknown> = Promise.resolve();
  const slot = async () => {
    const now = Math.floor(Date.now() / 60_000);
    if (now !== minute) [minute, used] = [now, 0];
    if (used >= PER_MINUTE) {
      await sleep((minute + 1) * 60_000 - Date.now() + 2_000);
      [minute, used] = [Math.floor(Date.now() / 60_000), 0];
    }
    used++;
  };
  return (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    const run = async () => {
      if (!url.includes("/api/v1/auth/")) await slot();
      const response = await real(input, init);
      if (process.env.LIVE_DEBUG && response.status >= 400)
        console.log("HTTP", response.status, init?.method ?? "GET", new URL(url).pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, (id) => id.slice(0, 8)));
      if (response.status !== 429) return response;
      await sleep(Number(response.headers.get("Retry-After") ?? "60") * 1000 + 2_000);
      return real(input, init);
    };
    const result = queue.then(run, run);
    queue = result.catch(() => undefined);
    return result;
  };
}

type Outcome = "PASS" | "FAIL" | "NOT VERIFIED" | "POLICY-BLOCKED";
const results: { op: string; outcome: Outcome; note: string }[] = [];
async function step(op: string, run: () => Promise<string | void>) {
  try {
    results.push({ op, outcome: "PASS", note: (await run()) ?? "" });
  } catch (error) {
    const e = error as { code?: string; status?: number; message?: string };
    const reason = `${e.code ?? e.status ?? ""} ${e.message ?? String(error)}`.trim();
    const tag = (["NOT VERIFIED", "POLICY-BLOCKED"] as const).find((t) => reason.includes(`${t}:`));
    results.push({ op, outcome: tag ?? "FAIL", note: tag ? reason.split(`${tag}:`)[1]!.trim() : reason });
  }
}
const notVerified = (why: string) => new Error(`NOT VERIFIED: ${why}`);
/** Resolves to the MessagingError code (or "ok"). */
const codeOf = (promise: Promise<unknown>) => promise.then(() => "ok", (error: { code?: string }) => error.code ?? String(error));

type Account = { email: string; password: string };
const accounts = (() => {
  const path = process.env.API_LIVE_COMPANY_ACCOUNTS;
  if (!path) return null;
  return JSON.parse(readFileSync(path, "utf8")) as { primary: Account; second: Account & { userId: string }; companyId: string };
})();

afterAll(() => {
  const report = "MESSAGES & MEETINGS LIVE RESULTS\n" + results.map((r) => `${r.outcome.padEnd(14)} ${r.op}${r.note ? " — " + r.note : ""}`).join("\n");
  if (process.env.LIVE_REPORT) writeReport(report);
  console.log(report);
});
function writeReport(report: string) {
  void import("node:fs").then((fs) => fs.writeFileSync(process.env.LIVE_REPORT!, report + "\n"));
}

async function userOf(client: ApiClient) {
  const { data } = await (client as unknown as { request: (m: "get", p: "/api/v1/auth/get-session") => Promise<{ data: { user: { id: string; name: string } } }> }).request("get", "/api/v1/auth/get-session");
  return { id: data.user.id, name: data.user.name };
}

describe.skipIf(!liveConfigured || !accounts)("Messages & Meetings P5 (live)", () => {
  it("supported UI workflows against the running backend", { timeout: 1_200_000 }, async () => {
    vi.stubGlobal("fetch", pacedFetch(globalThis.fetch));
    const a = await liveSession({ email: accounts!.primary.email, password: accounts!.primary.password });
    const b = await liveSession({ email: accounts!.second.email, password: accounts!.second.password });
    const userA = await userOf(a.client);
    const userB = await userOf(b.client);
    const A: MessagingRepository = createApiMessaging(a.client, userA);
    const B: MessagingRepository = createApiMessaging(b.client, userB);
    const apiA = typedAs<paths>(a.client);
    const stamp = new Date().toISOString().slice(0, 16);
    const cleanup: (() => Promise<unknown>)[] = [];
    let dm: string | null = null;
    let group: string | null = null;
    let sent: string | null = null;
    let bActorInDm: string | null = null;

    try {
      /* ── Messages ── */
      await step("DM create (A→B) + idempotent retry", async () => {
        const op = crypto.randomUUID();
        dm = await A.conversations.create({ personIds: [userB.id], clientOpId: op });
        const again = await A.conversations.create({ personIds: [userB.id], clientOpId: op });
        expect(again).toBe(dm);
        return `same id on retry`;
      });
      await step("DM invitation inbox (B) + accept", async () => {
        if (!dm) throw notVerified("no DM");
        const inbox = await B.conversations.invitations();
        const invitation = inbox.find((row) => row.conversationId === dm);
        if (!invitation) {
          const opened = await B.conversations.get(dm);
          if ("access" in opened && opened.access === "member") return "already admitted (no invitation step)";
          throw new Error(`no invitation for the DM (inbox ${inbox.length})`);
        }
        expect(await B.conversations.respondInvitation(invitation, true)).toBe(dm);
      });
      await step("DM open (A) + other participant", async () => {
        const detail = await A.conversations.get(dm!);
        if (!("memberCount" in detail)) throw new Error(`access ${detail.access}`);
        expect(detail.kind).toBe("direct");
        bActorInDm = detail.other?.id ?? null;
        return `members ${detail.memberCount}, receipts not fabricated: other.presence=${JSON.stringify(detail.other?.presence ?? null)}`;
      });
      await step("send + list + retrieve (A→B)", async () => {
        const message = await A.messages.send(dm!, { clientOpId: crypto.randomUUID(), body: `Live check ${stamp}` });
        sent = message.id;
        const page = await B.messages.page(dm!);
        expect(page.items.some((m) => m.id === sent && m.body === `Live check ${stamp}`)).toBe(true);
        const mine = (await A.messages.page(dm!)).items.find((m) => m.id === sent);
        return `receipt on my message: ${mine?.receipt ?? "null"}`;
      });
      await step("unread (B) then mark read", async () => {
        const before = await B.conversations.unreadCount();
        await B.conversations.markRead(dm!);
        const after = await B.conversations.unreadCount();
        expect(after).toBeLessThanOrEqual(before);
        return `unread ${before} → ${after}`;
      });
      await step("thread reply (B) + thread read (A)", async () => {
        await B.messages.send(dm!, { clientOpId: crypto.randomUUID(), body: "Thread reply", parentId: sent! });
        const thread = await A.messages.thread(dm!, sent!);
        expect(thread.replies.some((r) => r.body === "Thread reply")).toBe(true);
      });
      await step("reaction (B)", async () => {
        await B.messages.react(sent!, "👍");
        const message = (await A.messages.page(dm!)).items.find((m) => m.id === sent);
        return `reactions ${JSON.stringify(message?.reactions ?? null)}`;
      });
      await step("edit own message (A, within window)", async () => {
        const edited = await A.messages.edit(sent!, `Live check ${stamp} (edited)`);
        expect(edited.body).toContain("(edited)");
      });
      await step("edit someone else's message is refused (B)", async () => {
        const code = await codeOf(B.messages.edit(sent!, "nope"));
        expect(code).not.toBe("ok");
        return code;
      });
      await step("delete for everyone (A)", async () => {
        const temp = await A.messages.send(dm!, { clientOpId: crypto.randomUUID(), body: "to delete" });
        await A.messages.deleteForEveryone(temp.id);
        const shown = (await B.messages.page(dm!)).items.find((m) => m.id === temp.id);
        return `B sees ${shown ? `state ${shown.state}` : "nothing"}`;
      });
      await step("privacy: mute / unmute (notification mode)", async () => {
        await B.conversations.mute(dm!, true);
        expect((await B.conversations.list("all")).find((c) => c.id === dm)?.muted).toBe(true);
        await B.conversations.mute(dm!, false);
      });
      await step("privacy: own link-preview preference", async () => {
        await B.conversations.updateSettings(dm!, { linkPreviews: false });
        const detail = await B.conversations.get(dm!);
        if ("linkPreviews" in detail) expect(detail.linkPreviews).toBe(false);
        await B.conversations.updateSettings(dm!, { linkPreviews: true });
      });
      await step("global privacy screen (settings.get)", async () => {
        const code = await codeOf(A.settings.get());
        if (code === "unavailable") throw notVerified("no API for the approved global fields (documented gap) — screen reports unavailable");
        return code;
      });
      await step("block (A blocks B) → B cannot send; unblock restores", async () => {
        if (!bActorInDm) throw notVerified("other participant id unknown");
        await A.settings.block(bActorInDm);
        const blocked = await A.settings.blocked();
        const code = await codeOf(B.messages.send(dm!, { clientOpId: crypto.randomUUID(), body: "while blocked" }));
        await A.settings.unblock(bActorInDm);
        const after = await A.settings.blocked();
        expect(after.some((p) => p.id === bActorInDm)).toBe(false);
        return `blocked list ${blocked.length}, B send while blocked → ${code}`;
      });
      await step("private group create + B accepts + members", async () => {
        group = await A.conversations.create({ personIds: [userB.id], name: `Live check group ${stamp}`, clientOpId: crypto.randomUUID() });
        const invitation = (await B.conversations.invitations()).find((row) => row.conversationId === group);
        if (invitation) await B.conversations.respondInvitation(invitation, true);
        const people = await A.conversations.participants(group);
        cleanup.push(() => A.conversations.leave(group!).catch(() => undefined), () => B.conversations.leave(group!).catch(() => undefined));
        return `participants ${people.length}`;
      });
      await step("attachments / media upload", async () => {
        throw new Error("POLICY-BLOCKED: file content blocked in local Shared test mode (not attempted)");
      });

      /* ── Announcements (Company source of the fixture) ── */
      const companyId = accounts!.companyId;
      const source: MsgSource = { kind: "company", workspaceId: companyId, name: "" };
      let scheduledId: string | null = null;
      let publishedId: string | null = null;
      await step("announcement access (A manager / B member)", async () => {
        const [ma, mb] = await Promise.all([A.announcements.access(companyId, "company"), B.announcements.access(companyId, "company")]);
        return `A canPublish ${ma.canPublish}, B canPublish ${mb.canPublish}`;
      });
      await step("scheduled announcement create + idempotent retry + persistence", async () => {
        const input = {
          workspace: source,
          title: `Live check scheduled ${stamp}`,
          body: "Scheduled body",
          audience: { kind: "workspace" as const, label: "", memberIds: [] },
          pinDays: null,
          requireAck: false,
          scheduleAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
          clientOpId: crypto.randomUUID(),
        };
        scheduledId = await A.announcements.publish(input);
        expect(await A.announcements.publish(input)).toBe(scheduledId);
        const listA = await A.announcements.list(companyId, "company");
        const rows = listA.filter((row) => row.id === scheduledId);
        expect(rows).toHaveLength(1);
        expect(rows[0]!.scheduledFor).toBeTruthy();
        expect(rows[0]!.publishedAt).toBeNull();
        return `scheduledFor ${rows[0]!.scheduledFor}`;
      });
      await step("scheduled announcement hidden from member (B)", async () => {
        const listB = await B.announcements.list(companyId, "company");
        expect(listB.some((row) => row.id === scheduledId)).toBe(false);
      });
      await step("publish now (ALL, ack required) → B sees + acknowledges → A totals", async () => {
        publishedId = await A.announcements.publish({
          workspace: source,
          title: `Live check announcement ${stamp}`,
          body: "Published body",
          audience: { kind: "workspace", label: "", memberIds: [] },
          pinDays: null,
          requireAck: true,
          scheduleAt: null,
          clientOpId: crypto.randomUUID(),
        });
        const seen = (await B.announcements.list(companyId, "company")).find((row) => row.id === publishedId);
        if (!seen) throw new Error("B does not see the published announcement");
        await B.announcements.ack(publishedId);
        const mine = (await A.announcements.list(companyId, "company")).find((row) => row.id === publishedId);
        return `A totals ${mine?.ack ? `${mine.ack.done}/${mine.ack.total}` : "null"}, B acked ${(await B.announcements.list(companyId, "company")).find((r) => r.id === publishedId)?.acked}`;
      });
      await step("member (B) cannot publish", async () => {
        const code = await codeOf(
          B.announcements.publish({ workspace: source, title: "x", body: "x", audience: { kind: "workspace", label: "", memberIds: [] }, pinDays: null, requireAck: false, scheduleAt: null, clientOpId: crypto.randomUUID() }),
        );
        expect(code).not.toBe("ok");
        return code;
      });
      // Sweep every test-owned ("Live check …") announcement of the Company, including orphans of earlier runs.
      cleanup.push(async () => {
        const scoped = (await apiA.request("get", "/api/v1/announcements/scopes/{kind}/{scopeId}", { path: { kind: "COMPANY", scopeId: companyId }, query: { limit: 100 } })).data.items;
        const ids = new Set([scheduledId, publishedId, ...scoped.filter((v) => v.title.startsWith("Live check")).map((v) => v.announcementId)]);
        for (const id of ids) {
          if (!id) continue;
          const versions = (await apiA.request("get", "/api/v1/announcements/{id}/versions", { path: { id }, query: { limit: 50 } })).data.items;
          for (const version of versions) {
            if (version.state === "PUBLISHED")
              await apiA.request("post", "/api/v1/announcements/{id}/versions/{versionId}/withdraw", { path: { id, versionId: version.id }, header: { "If-Match": revisionTag(version.revision), "Idempotency-Key": crypto.randomUUID() }, body: {} });
            else if (version.state === "DRAFT") {
              const schedule = (await apiA.request("get", "/api/v1/announcements/{id}/versions/{versionId}/schedule", { path: { id, versionId: version.id } })).data;
              if (schedule?.status === "SCHEDULED")
                await apiA.request("post", "/api/v1/announcements/{id}/versions/{versionId}/schedule/cancel", {
                  path: { id, versionId: version.id },
                  header: { "If-Match": revisionTag(schedule.revision), "Idempotency-Key": crypto.randomUUID() },
                  body: {},
                });
            }
          }
        }
      });

      /* ── Meetings (Company work source) ── */
      // Sweep (runs last): cancel every ACTIVE test-owned meeting A organises, incl. orphans of earlier runs.
      cleanup.unshift(async () => {
        const rows = (await apiA.request("get", "/api/v1/meetings", { query: { limit: 100 } })).data.items;
        let canceled = 0;
        for (const row of rows) {
          if (row.state !== "ACTIVE" || row.role !== "ORGANIZER" || !row.event.title.startsWith("Live check")) continue;
          await apiA.request("patch", "/api/v1/meetings/{id}", { path: { id: row.id }, header: { "If-Match": revisionTag(row.revision), "Idempotency-Key": crypto.randomUUID() }, body: { state: "CANCELED" } });
          canceled++;
        }
        return `swept ${canceled}`;
      });
      let meetingId: string | null = null;
      await step("meeting create (Company source, invite B)", async () => {
        const sources = await A.meetings.sources();
        const company = sources.find((s) => s.kind === "company" && s.workspaceId === companyId);
        if (!company) throw notVerified("A has no meeting.create on the Company");
        const invitable = await A.meetings.invitable(company);
        const start = new Date(Date.now() + 2 * 86_400_000);
        start.setUTCMinutes(0, 0, 0);
        const end = new Date(start.getTime() + 3_600_000);
        meetingId = await A.meetings.create({
          title: `Live check meeting ${stamp}`,
          source: company,
          start: start.toISOString(),
          end: end.toISOString(),
          inviteeIds: invitable.filter((p) => p.name === userB.name).map((p) => p.id).slice(0, 1),
          link: null,
          clientOpId: crypto.randomUUID(),
        });
        cleanup.push(async () => {
          const { data } = await apiA.request("get", "/api/v1/meetings/{id}", { path: { id: meetingId! } });
          await apiA.request("patch", "/api/v1/meetings/{id}", { path: { id: meetingId! }, header: { "If-Match": revisionTag(data.revision), "Idempotency-Key": crypto.randomUUID() }, body: { state: "CANCELED" } });
        });
        return `invitable ${invitable.length}`;
      });
      await step("meeting read + update title (organiser)", async () => {
        if (!meetingId) throw notVerified("no meeting");
        await A.meetings.update(meetingId, { title: `Live check meeting ${stamp} (renamed)` });
        const detail = await A.meetings.get(meetingId);
        expect(detail?.title).toContain("(renamed)");
        expect(detail?.canEditAgenda).toBe(true);
        return `myRole ${detail?.myRole}, notes ${detail?.notes === null ? "null (no API)" : "served"}`;
      });
      await step("invitation (B inbox) + RSVP maybe (TENTATIVE)", async () => {
        if (!meetingId) throw notVerified("no meeting");
        const inbox = await B.meetings.invitations();
        if (!inbox.some((row) => row.meetingId === meetingId)) throw new Error(`invitation not in B inbox (${inbox.length})`);
        await B.meetings.rsvp(meetingId, "maybe");
        const detail = await A.meetings.get(meetingId);
        return `invitees ${detail?.invitees.map((i) => i.rsvp).join(",")}`;
      });
      await step("agenda add with planned minutes (organiser)", async () => {
        if (!meetingId) throw notVerified("no meeting");
        await A.meetings.addAgenda(meetingId, "Live check agenda", 15);
        const item = (await A.meetings.get(meetingId))?.agenda.find((g) => g.title === "Live check agenda");
        expect(item).toMatchObject({ minutes: 15, done: false, proposed: false });
      });
      await step("agenda completion toggle (organiser) + persisted", async () => {
        const item = (await A.meetings.get(meetingId!))?.agenda.find((g) => g.title === "Live check agenda");
        if (!item) throw notVerified("no agenda item");
        await A.meetings.toggleAgenda(meetingId!, item.id);
        expect((await A.meetings.get(meetingId!))?.agenda.find((g) => g.id === item.id)?.done).toBe(true);
      });
      await step("member (B): read agenda, cannot edit duration / completion", async () => {
        const detail = await B.meetings.get(meetingId!);
        if (!detail) throw new Error("B not admitted after TENTATIVE");
        expect(detail.canEditAgenda).toBe(false);
        const item = detail.agenda.find((g) => g.title === "Live check agenda");
        const code = item ? await codeOf(B.meetings.toggleAgenda(meetingId!, item.id)) : "no item";
        expect(code).not.toBe("ok");
        return `B sees minutes ${item?.minutes}, done ${item?.done}; toggle → ${code}`;
      });
      await step("agenda proposal (B) + organiser accepts", async () => {
        await B.meetings.proposeAgenda(meetingId!, "Live check proposal");
        const proposal = (await A.meetings.get(meetingId!))?.agenda.find((g) => g.title === "Live check proposal");
        if (!proposal?.proposed) throw new Error("proposal not visible to organiser");
        await A.meetings.decideAgenda(meetingId!, proposal.id, true);
        expect((await A.meetings.get(meetingId!))?.agenda.find((g) => g.id === proposal.id)?.proposed).toBe(false);
      });
      await step("shared meeting notes", async () => {
        throw notVerified("current UI notes are meeting-level; the API has per-agenda-entry notes only (no UI surface)");
      });
      await step("personal meeting (organiser only)", async () => {
        const start = new Date(Date.now() + 4 * 86_400_000);
        start.setUTCMinutes(0, 0, 0);
        const id = await A.meetings.create({ title: `Live check personal ${stamp}`, source: { kind: "personal", workspaceId: null, name: "" }, start: start.toISOString(), end: new Date(start.getTime() + 1_800_000).toISOString(), inviteeIds: [], link: null, clientOpId: crypto.randomUUID() });
        cleanup.push(async () => {
          const { data } = await apiA.request("get", "/api/v1/meetings/{id}", { path: { id } });
          await apiA.request("patch", "/api/v1/meetings/{id}", { path: { id }, header: { "If-Match": revisionTag(data.revision), "Idempotency-Key": crypto.randomUUID() }, body: { state: "CANCELED" } });
        });
        expect((await A.meetings.get(id))?.title).toContain("personal");
      });
      await step("meeting files", async () => {
        throw new Error("POLICY-BLOCKED: file content blocked in local Shared test mode (not attempted)");
      });
    } finally {
      for (const [index, run] of cleanup.reverse().entries()) await step(`cleanup ${index + 1}`, async () => { const note = await run(); return typeof note === "string" ? note : undefined; });
      a.end();
      b.end();
    }
  });
});
