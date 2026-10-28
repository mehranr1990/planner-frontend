import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { createMockRepositories } from "./mock";
import { DataProvider } from "./provider";
import {
  planKeys,
  taskKeys,
  useBlocks,
  useFocusToday,
  useMoveBlock,
  usePriorities,
  useRecordFocusSessions,
  useScheduleTask,
  useSetBlockDone,
  useSetPriorities,
  useUnscheduledTasks,
  useUnscheduleBlock,
} from "./queries";

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const repositories = createMockRepositories();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <DataProvider repositories={repositories}>{children}</DataProvider>
    </QueryClientProvider>
  );
  return { wrapper, client };
}

const TODAY = "2026-10-13";

describe("query keys (My Day)", () => {
  it("keep unscheduled lists under the tasks family and plan keys under plan", () => {
    expect(taskKeys.unscheduled(TODAY, "today").slice(0, 1)).toEqual(taskKeys.all);
    // Only the week range depends on the week's first day.
    expect(taskKeys.unscheduled(TODAY, "today", 6)).toEqual(taskKeys.unscheduled(TODAY, "today", 0));
    expect(taskKeys.unscheduled(TODAY, "week", 6)).not.toEqual(taskKeys.unscheduled(TODAY, "week", 0));
    expect(planKeys.priorities(TODAY)).toEqual(["plan", "priorities", TODAY]);
    expect(planKeys.focus(TODAY)).toEqual(["plan", "focus", TODAY]);
  });
});

describe("My Day read hooks", () => {
  it("serve the unscheduled list, priorities and focus summary", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(
      () => ({
        unscheduled: useUnscheduledTasks(TODAY, "today"),
        priorities: usePriorities(TODAY),
        focus: useFocusToday(TODAY),
      }),
      { wrapper },
    );
    await waitFor(() =>
      expect(
        result.current.unscheduled.isSuccess && result.current.priorities.isSuccess && result.current.focus.isSuccess,
      ).toBe(true),
    );
    expect(result.current.unscheduled.data).toHaveLength(4);
    expect(result.current.priorities.data?.map((item) => item.rank)).toEqual([1, 2, 3]);
    expect(result.current.focus.data).toEqual({ sessionsCompleted: 2, cycle: 1 });
  });

  it("recording focus sessions refreshes useFocusToday", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => ({ focus: useFocusToday(TODAY), record: useRecordFocusSessions() }), { wrapper });
    await waitFor(() => expect(result.current.focus.isSuccess).toBe(true));
    await act(() => result.current.record.mutateAsync({ day: TODAY, count: 1, cycle: 2 }));
    await waitFor(() => expect(result.current.focus.data).toEqual({ sessionsCompleted: 3, cycle: 2 }));
  });
});

describe("My Day mutations", () => {
  it("scheduling a task refreshes the timeline and the unscheduled list, and resolves to the block", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(
      () => ({
        blocks: useBlocks(TODAY),
        unscheduled: useUnscheduledTasks(TODAY, "today"),
        schedule: useScheduleTask(),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.blocks.isSuccess && result.current.unscheduled.isSuccess).toBe(true));
    expect(result.current.blocks.data).toHaveLength(7);

    let block;
    await act(async () => {
      block = await result.current.schedule.mutateAsync({ taskId: "t-plan-weekend-trip", day: TODAY, start: "18:30" });
    });
    expect(block).toMatchObject({ taskId: "t-plan-weekend-trip", start: "2026-10-13T18:30:00+03:30" });
    await waitFor(() => expect(result.current.blocks.data).toHaveLength(8));
    await waitFor(() => expect(result.current.unscheduled.data).toHaveLength(3));
  });

  it("move, done, unschedule and priorities go through the repository and refresh readers", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(
      () => ({
        blocks: useBlocks(TODAY),
        priorities: usePriorities(TODAY),
        move: useMoveBlock(),
        done: useSetBlockDone(),
        unschedule: useUnscheduleBlock(),
        setPriorities: useSetPriorities(),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.blocks.isSuccess && result.current.priorities.isSuccess).toBe(true));

    await act(async () => {
      await result.current.move.mutateAsync({ blockId: "gym", day: TODAY, start: "19:00" });
    });
    await waitFor(() => expect(result.current.priorities.data?.[1]?.time).toBe("19:00"));

    await act(async () => {
      const done = await result.current.done.mutateAsync({ blockId: "client-call", done: true });
      expect(done.done).toBe(true);
    });
    await waitFor(() => expect(result.current.blocks.data?.find((item) => item.id === "client-call")?.done).toBe(true));

    await act(async () => {
      await result.current.unschedule.mutateAsync({ blockId: "ui-design" });
    });
    await waitFor(() => expect(result.current.blocks.data?.some((item) => item.id === "ui-design")).toBe(false));

    await act(async () => {
      await result.current.setPriorities.mutateAsync({ day: TODAY, refs: [{ kind: "task", id: "t-call-dentist" }] });
    });
    await waitFor(() => expect(result.current.priorities.data?.map((item) => item.id)).toEqual(["t-call-dentist"]));
  });

  it("surfaces repository rejections on the mutation", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useUnscheduleBlock(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ blockId: "lunch" })).rejects.toMatchObject({ code: "forbidden" });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
