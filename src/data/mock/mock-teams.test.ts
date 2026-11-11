import { describe, expect, it } from "vitest";
import { clearAt, createMockTeams, teamCapabilities } from "./mock-teams";

const respond = <T,>(value: T) => Promise.resolve(structuredClone(value));
const OPENABLE = new Set(["website-redesign", "planner-app", "brand-refresh", "mobile-onboarding", "spring-campaign"]);
const make = () =>
  createMockTeams({
    respond,
    findProject: (id) =>
      OPENABLE.has(id) ? { id, name: id, percent: 50, health: "on-track", lifecycle: "active" } : undefined,
  });

describe("mock teams (TS-01 / TM-00)", () => {
  it("lists my teams; project counts only include projects I can open", async () => {
    const { teams } = make();
    const directory = await teams.listAccessible();
    const counts = Object.fromEntries(directory.teams.map((team) => [team.id, team.projectCount]));
    expect(counts).toEqual({ design: 3, mobile: 1, growth: 2, "launch-crew": 1 });
    expect(directory.teams.find((team) => team.id === "launch-crew")?.lifecycle).toBe("archived");
    expect(directory.teams[0]).not.toHaveProperty("linkedProjectIds");
  });

  it("answers access: ok with capabilities, invite pending, removed, not available", async () => {
    const { teams } = make();
    const design = await teams.access("design");
    expect(design.status).toBe("ok");
    if (design.status === "ok") {
      expect(design.capabilities.modules.settings).toBe(false);
      expect(design.capabilities.setOwnStatus).toBe(true);
    }
    expect((await teams.access("research")).status).toBe("invite-pending");
    expect((await teams.access("old-studio")).status).toBe("removed");
    expect((await teams.access("nope")).status).toBe("not-available");
    const viewer = await teams.access("design", { previewRole: "viewer" });
    expect(viewer.status === "ok" && viewer.capabilities.setOwnStatus).toBe(false);
  });

  it("hides Settings unless Lead+, and archived teams are read-only", () => {
    expect(teamCapabilities("lead", "active").modules.settings).toBe(true);
    expect(teamCapabilities("member", "active").modules.settings).toBe(false);
    const archived = teamCapabilities("admin", "archived");
    expect(archived.restore).toBe(true);
    expect(archived.createTask).toBe(false);
    expect(teamCapabilities("viewer", "active").seeBooking).toBe(false);
  });

  it("accepting an invitation joins the team (no project access granted)", async () => {
    const { teams, teamInvitations } = make();
    const [invitation] = await teamInvitations.listMine();
    expect(await teamInvitations.accept(invitation!.id)).toEqual({ teamId: "research" });
    const research = await teams.access("research");
    expect(research.status === "ok" && research.team.projectCount).toBe(0);
    expect(await teamInvitations.listMine()).toEqual([]);
  });

  it("restores an archived team for Owner/Admin", async () => {
    const { teams } = make();
    expect((await teams.restore("launch-crew")).lifecycle).toBe("active");
    await expect(teams.restore("design")).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("mock presence (manual status)", () => {
  it("expired statuses come back as No status (nothing inferred)", async () => {
    const { presence } = make();
    const list = await presence.list("design");
    expect(list.find((entry) => entry.personId === "ava")?.status).toBeNull();
    expect(list.find((entry) => entry.personId === "harry")?.status).toBe("busy");
  });

  it("sets and clears my status for one team or all my teams", async () => {
    const { presence } = make();
    const set = await presence.set("design", {
      status: "busy",
      note: " deep work ",
      clearAfter: "today",
      allTeams: false,
      shareWorkingOn: true,
    });
    expect(set).toMatchObject({ status: "busy", note: "deep work", until: "2026-10-13T23:59:00+03:30" });
    expect((await presence.mine("mobile")).status).toBe("available");

    await presence.set("design", { status: "away", note: "", clearAfter: "never", allTeams: true, shareWorkingOn: false });
    expect((await presence.mine("mobile")).status).toBe("away");
    expect((await presence.mine("growth")).status).toBe("away");

    await presence.clear("design");
    expect((await presence.mine("design")).status).toBeNull();
    expect((await presence.mine("mobile")).status).toBeNull();
  });

  it("refuses a status from a Viewer", async () => {
    const { presence } = make();
    await expect(
      presence.set("growth", { status: "busy", note: "", clearAfter: "hour", allTeams: false, shareWorkingOn: false }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("computes clear-after instants in Iran time; weeks end on Friday", () => {
    const now = "2026-10-13T14:35:00+03:30";
    expect(clearAt("never", now, "2026-10-13")).toBeNull();
    expect(Date.parse(clearAt("hour", now, "2026-10-13")!)).toBe(Date.parse(now) + 3_600_000);
    expect(clearAt("week", now, "2026-10-13")).toBe("2026-10-16T23:59:00+03:30");
    expect(clearAt("week", now, "2026-10-16")).toBe("2026-10-16T23:59:00+03:30");
  });
});

describe("mock team overview repos (TM-01)", () => {
  it("members carry team role and job title; the header lead comes from the summary", async () => {
    const { teams } = make();
    const members = await teams.members("design");
    expect(members.find((member) => member.person.id === "harry")).toMatchObject({ role: "lead", title: "Head of Design" });
    expect(members.find((member) => member.person.id === "me")?.role).toBe("member");
    const access = await teams.access("design");
    expect(access.status === "ok" && access.team.lead?.name).toBe("Harry B.");
  });

  it("lists only linked projects the viewer can open", async () => {
    const { teams } = make();
    expect((await teams.projects("design")).map((project) => project.id)).toEqual([
      "website-redesign",
      "planner-app",
      "brand-refresh",
    ]);
  });

  it("booking is refused to Viewers; private thanks never reach the team feed", async () => {
    const { teamCapacity, teamRecognition } = make();
    expect(await teamCapacity.week("design")).toHaveLength(8);
    await expect(teamCapacity.week("growth")).rejects.toMatchObject({ code: "forbidden" });
    const thanks = await teamRecognition.recent("design");
    expect(thanks.every((item) => item.visibility === "team")).toBe(true);
  });

  it("shares 'now working on' only when the person opted in", async () => {
    const { presence } = make();
    const list = await presence.list("design");
    expect(list.find((entry) => entry.personId === "sarah")?.workingOn).toBe("Icon set v2 · review");
    expect(list.find((entry) => entry.personId === "harry")?.workingOn).toBeNull();
  });

  it("team work includes project tasks only when asked and only for openable projects", async () => {
    const { teamTasks } = make();
    const all = await teamTasks.list("design");
    expect(all.some((task) => task.source.kind === "project")).toBe(true);
    const teamOnly = await teamTasks.list("design", { includeProjects: false });
    expect(teamOnly.every((task) => task.source.kind === "team")).toBe(true);
    expect(await teamTasks.list("design", { status: "blocked" })).toHaveLength(3);
  });
});
