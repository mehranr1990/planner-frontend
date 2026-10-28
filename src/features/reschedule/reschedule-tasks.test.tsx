import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dismiss } from "@/components/ui/toast";
import { createMockRepositories } from "@/data/mock";
import { DataProvider } from "@/data/provider";
import type { Repositories } from "@/data/repositories";
import { TASK_RESCHEDULE_OPTIONS } from "@/features/my-day/domain/reschedule";
import type { RescheduleTarget } from "@/features/my-day/my-day-context";
import { RescheduleSurface } from "@/features/my-day/reschedule/reschedule-host";
import { mockViewport } from "@/features/my-day/states/test-utils";
import { renderWithProviders } from "@/test/render";
import { useRescheduleActions } from "./use-reschedule-actions";

/* The shared Reschedule as Tasks / P06 use it: a task target, the task rows, a repository-snapshot Undo. */

function Harness({ target }: { target: RescheduleTarget }) {
  const { apply } = useRescheduleActions();
  return (
    <RescheduleSurface
      request={{ target, anchor: null }}
      day="2026-10-13"
      apply={apply}
      options={TASK_RESCHEDULE_OPTIONS}
      onClose={() => {}}
    />
  );
}

function setup(target: RescheduleTarget, repositories: Repositories = createMockRepositories()) {
  renderWithProviders(
    <DataProvider repositories={repositories}>
      <Harness target={target} />
    </DataProvider>,
  );
  return repositories;
}

beforeEach(() => mockViewport("desktop"));
afterEach(() => {
  act(() => dismiss());
});

describe("Reschedule for tasks", () => {
  it("offers This week and calls several tasks tasks, never blocks", async () => {
    setup({ kind: "tasks", ids: ["t-ui-design", "t-deep-work"] });
    expect(await screen.findByRole("heading", { name: "Move 2 tasks" })).toBeInTheDocument();
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: /^This week · Thu/ })).toBeInTheDocument();
  });

  it("Undo restores a block that lay outside the loaded days instead of deleting it", async () => {
    const user = userEvent.setup();
    const repositories = createMockRepositories();
    // The task's block sits on a day the session does not load.
    const far = await repositories.blocks.move("ui-design", { day: "2026-10-25", start: "14:00" });
    setup({ kind: "task", id: "t-ui-design" }, repositories);

    await user.click(await screen.findByRole("menuitem", { name: /^Tomorrow/ }));
    await waitFor(async () =>
      expect((await repositories.blocks.listForDay("2026-10-25")).map((block) => block.id)).not.toContain("ui-design"),
    );

    await user.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(async () => {
      const restored = (await repositories.blocks.listForDay("2026-10-25")).find((block) => block.id === "ui-design");
      expect(restored).toMatchObject({ start: far.start, end: far.end, taskId: "t-ui-design" });
    });
    expect((await repositories.blocks.listForDay("2026-10-14")).some((block) => block.taskId === "t-ui-design")).toBe(false);
    expect(await repositories.tasks.get("t-ui-design")).toMatchObject({ date: "2026-10-25", time: "14:00" });
  });
});
