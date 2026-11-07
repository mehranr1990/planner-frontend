import { describe, expect, it } from "vitest";
import { createMockProjects, mockCapabilities } from "./mock-projects";

const respond = <T>(value: T) => Promise.resolve(structuredClone(value));

describe("mock projects (SH-01/SH-02, PJ-00)", () => {
  it("lists accessible projects with server counts and the recent order", async () => {
    const { projects } = createMockProjects({ respond });
    const directory = await projects.listAccessible();
    expect(directory.projects.map((project) => project.id)).toEqual([
      "website-redesign",
      "planner-app",
      "mobile-onboarding",
      "brand-refresh",
      "spring-campaign",
    ]);
    expect(directory.counts).toEqual({
      all: 4,
      owned: 2,
      member: 2,
      invitations: 1,
      archived: 1,
    });
    expect(directory.recentIds[0]).toBe("website-redesign");
  });

  it("answers access with capabilities; forbidden = not found; invite and revoked answers", async () => {
    const { projects } = createMockProjects({ respond });
    const manager = await projects.access("website-redesign");
    if (manager.status !== "ok") throw new Error("expected ok");
    expect(manager.capabilities.editStatus).toBe(true);
    expect(manager.capabilities.invite).toBe(false);
    expect(manager.capabilities.modules.settings).toBe(false);
    expect((await projects.access("nope")).status).toBe("not-available");
    expect((await projects.access("data-migration")).status).toBe("invite-pending");
    expect((await projects.access("old-agency")).status).toBe("revoked");
  });

  it("previews other roles and the archived lifecycle for the demo switch", async () => {
    const { projects } = createMockProjects({ respond });
    const viewer = await projects.access("website-redesign", {
      previewRole: "viewer",
    });
    if (viewer.status !== "ok") throw new Error("expected ok");
    expect(viewer.project.role).toBe("viewer");
    expect(viewer.capabilities.createTask).toBe(false);
    expect(viewer.capabilities.seeTeamLoad).toBe(false);
    const guest = await projects.access("website-redesign", {
      previewRole: "guest",
    });
    if (guest.status !== "ok") throw new Error("expected ok");
    expect(Object.values(guest.capabilities.modules).every((visible) => !visible)).toBe(true);
    expect(guest.project.sharedTaskCount).toBe(3);
    const archived = await projects.access("website-redesign", {
      previewArchived: true,
    });
    if (archived.status !== "ok") throw new Error("expected ok");
    expect(archived.project.lifecycle).toBe("archived");
    expect(archived.capabilities.editStatus).toBe(false);
  });

  it("follows the permission tables: owner restores archived, member cannot edit status", () => {
    expect(mockCapabilities("owner", "archived").restore).toBe(true);
    expect(mockCapabilities("manager", "archived").restore).toBe(false);
    expect(mockCapabilities("member", "active").editStatus).toBe(false);
    expect(mockCapabilities("member", "active").createTask).toBe(true);
    expect(mockCapabilities("admin", "active").invite).toBe(true);
  });

  it("accepting an invitation adds the project; declining an unknown one fails", async () => {
    const store = createMockProjects({ respond });
    const [invitation] = await store.invitations.listMine();
    expect(await store.invitations.accept(invitation!.id)).toEqual({
      projectId: "data-migration",
    });
    expect((await store.projects.access("data-migration")).status).toBe("ok");
    expect(await store.invitations.listMine()).toEqual([]);
    await expect(store.invitations.decline("missing")).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("sets status + note for Manager+ only", async () => {
    const { projects } = createMockProjects({ respond });
    const updated = await projects.setStatus("website-redesign", {
      health: "on-track",
      note: "Vendor replied.",
    });
    expect(updated.health).toBe("on-track");
    expect(updated.statusNote?.text).toBe("Vendor replied.");
    await expect(projects.setStatus("planner-app", { health: "at-risk", note: "" })).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});
