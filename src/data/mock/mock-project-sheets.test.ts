import { describe, expect, it } from "vitest";
import { createMockProjects } from "./mock-projects";

const respond = <T>(value: T) => Promise.resolve(structuredClone(value));

describe("mock project sheets (PJ-90)", () => {
  it("creates an independent owned project and discards it on undo", async () => {
    const store = createMockProjects({ respond });
    const created = await store.projectCreate.create({
      name: "Help Center",
      key: "HC",
      startDate: "2026-10-13",
      endDate: "2026-12-01",
      template: "website",
    });
    expect(created).toMatchObject({ id: "help-center", role: "owner", initials: "HC", lifecycle: "active" });
    expect((await store.projects.listAccessible()).recentIds[0]).toBe("help-center");
    await store.projectCreate.discard("help-center");
    expect((await store.projects.access("help-center")).status).toBe("not-available");
  });

  it("checks project key format and uniqueness (incl. projects behind pending invitations)", async () => {
    const store = createMockProjects({ respond });
    const input = { name: "Help Center", startDate: "2026-10-13", endDate: "2026-12-01", template: "blank" as const };
    expect(await store.projectCreate.isKeyAvailable("WEB")).toBe(false);
    expect(await store.projectCreate.isKeyAvailable("DAT")).toBe(false);
    expect(await store.projectCreate.isKeyAvailable("HC")).toBe(true);
    await expect(store.projectCreate.create({ ...input, key: "WEB" })).rejects.toThrow("key-taken");
    await expect(store.projectCreate.create({ ...input, key: "1hc" })).rejects.toThrow("key-format");
    const created = await store.projectCreate.create({ ...input, key: "HC" });
    expect(created.key).toBe("HC");
    expect(await store.projectCreate.isKeyAvailable("HC")).toBe(false);
  });

  it("invites without revealing accounts; only Owner/Admin may invite", async () => {
    const store = createMockProjects({ respond });
    const sent = await store.memberInvites.send("mobile-onboarding", ["Kian@Araxitis.com", "new@person.io"], "member");
    expect(sent.map((invite) => invite.email)).toEqual(["kian@araxitis.com", "new@person.io"]);
    await expect(store.memberInvites.send("website-redesign", ["a@b.co"], "member")).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(store.memberInvites.send("mobile-onboarding", ["nope"], "member")).rejects.toMatchObject({
      code: "invalid",
    });
  });

  it("reassigns to a member with a pending assignment", async () => {
    const store = createMockProjects({ respond });
    const task = await store.reassign.reassign("empty-states", { personId: "jonathan", note: "You know the copy" });
    expect(task.assignees).toEqual([
      expect.objectContaining({ person: expect.objectContaining({ id: "jonathan" }), state: "pending" }),
    ]);
  });
});
