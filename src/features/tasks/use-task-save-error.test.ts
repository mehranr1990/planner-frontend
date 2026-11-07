import { describe, expect, it } from "vitest";
import { retryPatch } from "./use-task-save-error";

describe("retryPatch", () => {
  it("re-sends only the failed fields with the user's values", () => {
    const edit = { title: "A", durationMinutes: 25, labels: ["Work"], checklist: [{ title: "x", done: false }] };
    expect(retryPatch(["duration"], edit)).toEqual({ durationMinutes: 25 });
    expect(retryPatch(["labels", "checklist"], edit)).toEqual({ labels: ["Work"], checklist: [{ title: "x", done: false }] });
    expect(retryPatch(["note"], edit)).toEqual({});
  });
});
