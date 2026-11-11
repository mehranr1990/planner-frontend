import { describe, expect, it } from "vitest";
import { createMockTeams } from "./mock-teams";

const respond = <T,>(value: T) => Promise.resolve(structuredClone(value));
const make = () =>
  createMockTeams({
    respond,
    findProject: (id) => (id === "planner-app" ? { id, name: "Planner App", percent: 0, health: "on-track", lifecycle: "active" } : undefined),
  });

describe("mock recognition + feedback (TM-10)", () => {
  it("private thanks reach only writer and recipients; project links only when the viewer can open them", async () => {
    const store = make();
    const recent = await store.teamRecognition.recent("design");
    expect(recent.every((item) => item.visibility === "team")).toBe(true);
    const feed = await store.teamRecognition.list("design");
    expect(feed.find((item) => item.id === "th-2")?.visibility).toBe("private");
    expect(feed.find((item) => item.id === "th-4")?.link?.title).toBe("Planner App");
    const given = await store.teamRecognition.give("design", {
      toIds: ["sarah"],
      text: "Thanks",
      visibility: "team",
      link: { kind: "project", id: "partner-portal", title: "Partner Portal" },
    });
    expect(given.link).toBeNull();
    await expect(store.teamRecognition.give("design", { toIds: ["me"], text: "x", visibility: "team" })).rejects.toMatchObject({ code: "invalid" });
  });

  it("author deletes own; recipient hides; Owner/Admin removal is audited", async () => {
    const store = make();
    await expect(store.teamRecognition.remove("design", "th-1")).rejects.toMatchObject({ code: "forbidden" });
    const given = await store.teamRecognition.give("mobile", { toIds: ["kian"], text: "Release build", visibility: "team" });
    await store.teamRecognition.remove("mobile", given.id);
    expect(await store.teamRecognition.list("mobile")).toEqual([]);
  });

  it("feedback inbox holds only my 1:1s; answering closes the request; Viewers cannot write", async () => {
    const store = make();
    const inbox = await store.teamFeedback.inbox("design");
    expect(inbox.received.map((note) => note.id)).toEqual(["fb-1"]);
    expect(JSON.stringify(inbox)).not.toContain("Private to Sarah");
    await store.teamFeedback.write("design", { toId: "amelie", about: "", body: "Cut it", requestId: "fr-1" });
    expect((await store.teamFeedback.inbox("design")).asked).toEqual([]);
    await expect(store.teamFeedback.request("growth", { toId: "lena", about: "", question: "?" })).rejects.toMatchObject({ code: "forbidden" });
  });
});
