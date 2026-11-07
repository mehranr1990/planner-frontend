import { describe, expect, it } from "vitest";
import { createMockProjects } from "./mock-projects";

const respond = <T>(value: T) => Promise.resolve(structuredClone(value));

describe("mock project sheets (PJ-90)", () => {
  it("creates an independent owned project and discards it on undo", async () => {
    const store = createMockProjects({ respond });
    const created = await store.projectCreate.create({
      name: "Help Center",
      startDate: "2026-10-13",
      endDate: "2026-12-01",
      template: "website",
    });
    expect(created).toMatchObject({ id: "help-center", role: "owner", initials: "HC", lifecycle: "active" });
    expect((await store.projects.listAccessible()).recentIds[0]).toBe("help-center");
    await store.projectCreate.discard("help-center");
    expect((await store.projects.access("help-center")).status).toBe("not-available");
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
