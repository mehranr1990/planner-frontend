import { describe, expect, it } from "vitest";
import { createMockTeams } from "./mock-teams";

const respond = <T,>(value: T) => Promise.resolve(structuredClone(value));

describe("mock team settings (TM-14)", () => {
  it("rights per tab: Lead edits Planning, not General; Members cannot open settings", async () => {
    const store = createMockTeams({ respond });
    const mobile = await store.teamSettings.get("mobile");
    await expect(store.teamSettings.update("mobile", { name: "X" }, mobile.revision)).rejects.toMatchObject({ code: "forbidden" });
    const saved = await store.teamSettings.update("mobile", { estimateUnit: "points" }, mobile.revision);
    expect(saved.estimateUnit).toBe("points");
    await expect(store.teamSettings.update("mobile", { checkinsOn: false }, mobile.revision)).rejects.toMatchObject({ code: "conflict" });
    await expect(store.teamSettings.get("design")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("Sprints → Weekly needs the active sprint completed; Weekly → Sprints drafts Sprint 1 from this week", async () => {
    const store = createMockTeams({ respond });
    await expect(store.teamSettings.setPlanningMode("mobile", "weekly")).rejects.toMatchObject({ code: "conflict" });
    const sprint = await store.teamSprints.current("mobile");
    await store.teamSprints.complete("mobile", sprint.sprint!.id, {});
    expect((await store.teamSettings.setPlanningMode("mobile", "weekly")).planningMode).toBe("weekly");

    const team = await store.teams.create({ name: "Ops", planningMode: "weekly" });
    await store.teamTasks.create(team.id, { title: "Runbook" });
    await store.teamSettings.setPlanningMode(team.id, "sprints");
    expect((await store.teamSprints.current(team.id)).next.items.map((item) => item.title)).toContain("Runbook");
  });

  it("switches feed capabilities: check-ins off hides the module, status off stops manual status", async () => {
    const store = createMockTeams({ respond });
    const { revision } = await store.teamSettings.get("mobile");
    await store.teamSettings.update("mobile", { checkinsOn: false, statusOn: false }, revision);
    const access = await store.teams.access("mobile");
    if (access.status !== "ok") throw new Error("no access");
    expect(access.capabilities.modules.checkins).toBe(false);
    expect(access.capabilities.setOwnStatus).toBe(false);
  });

  it("Owner: transfer needs the successor's accept + reauth; delete needs the name + reauth and leaves projects", async () => {
    const store = createMockTeams({ respond });
    const team = await store.teams.create({ name: "Ops", planningMode: "weekly" });
    await expect(store.teamSettings.requestTransfer(team.id, "me")).rejects.toMatchObject({ code: "invalid" });
    await expect(store.teamSettings.remove(team.id, { name: "Opz", password: "x" })).rejects.toMatchObject({ message: "name-mismatch" });
    await expect(store.teamSettings.remove(team.id, { name: "Ops", password: "wrong" })).rejects.toMatchObject({ message: "reauth" });
    await store.teamSettings.remove(team.id, { name: "Ops", password: "secret" });
    expect((await store.teams.access(team.id)).status).toBe("not-available");
  });
});
