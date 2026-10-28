import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { createMockRepositories } from "./mock";
import { DataProvider } from "./provider";
import {
  taskKeys,
  useAreas,
  useBlocks,
  useBulkUpdateTasks,
  useCreateTask,
  useRemoveTasks,
  useReorderTasks,
  useRestoreTasks,
  useSetTaskDone,
  useTaskCounts,
  useTasks,
  useUpdateTask,
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

describe("task keys (P03)", () => {
  it("fold equivalent queries into one cache entry", () => {
    expect(taskKeys.list({})).toEqual(taskKeys.list({ filters: { areaIds: [] }, search: "  " }));
    expect(taskKeys.list({ filters: { areaIds: ["b", "a"] } })).toEqual(taskKeys.list({ filters: { areaIds: ["a", "b", "a"] } }));
    expect(taskKeys.list({ search: "Bill  PAY" })).toEqual(taskKeys.list({ search: "bill pay" }));
    expect(taskKeys.list({ sort: "manual" })).not.toEqual(taskKeys.list({ sort: "smart" }));
    expect(taskKeys.list({ search: "x" })).not.toEqual(taskKeys.list({}));
  });

  it("keep counts and areas under the tasks family", () => {
    expect(taskKeys.counts({ day: TODAY }).slice(0, 1)).toEqual(taskKeys.all);
    expect(taskKeys.areas().slice(0, 1)).toEqual(taskKeys.all);
    expect(taskKeys.counts({})).toEqual(taskKeys.counts({ filters: {}, search: "" }));
  });
});

describe("task read hooks", () => {
  it("useTasks passes filters, search and sort through", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(
      () => useTasks({ view: "today", day: TODAY, filters: { areaIds: ["personal"] }, sort: "smart", search: "notes" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((task) => task.id)).toEqual(["t-check-in-notes"]);
  });

  it("useTaskCounts and useAreas", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => ({ counts: useTaskCounts({ day: TODAY }), areas: useAreas() }), { wrapper });
    await waitFor(() => expect(result.current.counts.isSuccess && result.current.areas.isSuccess).toBe(true));
    expect(result.current.counts.data).toEqual({ today: 9, upcoming: 7, all: 28, completed: 9 });
    expect(result.current.areas.data?.map((area) => area.name)).toContain("Health");
  });
});

describe("task mutations", () => {
  it("create refreshes lists and counts, and resolves to the task", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(
      () => ({ counts: useTaskCounts({ day: TODAY }), tasks: useTasks({ view: "today", day: TODAY }), create: useCreateTask() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.counts.isSuccess && result.current.tasks.isSuccess).toBe(true));
    let created;
    await act(async () => {
      created = await result.current.create.mutateAsync({ title: "Pay rent", date: TODAY });
    });
    expect(created).toMatchObject({ title: "Pay rent", date: TODAY });
    await waitFor(() => expect(result.current.counts.data?.today).toBe(10));
    expect(result.current.tasks.data?.map((task) => task.title)).toContain("Pay rent");
  });

  it("update that moves a task's block refreshes the timeline", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => ({ blocks: useBlocks(TODAY), update: useUpdateTask() }), { wrapper });
    await waitFor(() => expect(result.current.blocks.isSuccess).toBe(true));
    await act(async () => {
      await result.current.update.mutateAsync({ id: "t-ui-design", patch: { time: null } });
    });
    await waitFor(() => expect(result.current.blocks.data?.map((block) => block.id)).not.toContain("ui-design"));
  });

  it("setDone, reorder and bulk update invalidate the lists", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(
      () => ({
        counts: useTaskCounts({ day: TODAY }),
        done: useSetTaskDone(),
        reorder: useReorderTasks(),
        bulk: useBulkUpdateTasks(),
        urgent: useTasks({ view: "all", filters: { priorities: ["urgent"] } }),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.counts.isSuccess && result.current.urgent.isSuccess).toBe(true));
    await act(async () => {
      await result.current.done.mutateAsync({ id: "t-pay-electricity-bill", done: true });
    });
    await waitFor(() => expect(result.current.counts.data).toMatchObject({ today: 8, completed: 10 }));
    await act(async () => {
      await result.current.reorder.mutateAsync({ ids: ["t-ui-design", "t-check-in-notes"] });
      await result.current.bulk.mutateAsync({ ids: ["t-read-30-pages"], patch: { priority: "urgent" } });
    });
    await waitFor(() => expect(result.current.urgent.data?.map((task) => task.id)).toContain("t-read-30-pages"));
  });

  it("remove resolves to a snapshot that restore puts back", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(
      () => ({ counts: useTaskCounts({ day: TODAY }), remove: useRemoveTasks(), restore: useRestoreTasks() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.counts.isSuccess).toBe(true));
    let snapshot;
    await act(async () => {
      snapshot = (await result.current.remove.mutateAsync({ ids: ["t-ui-design"] })).restore;
    });
    await waitFor(() => expect(result.current.counts.data?.all).toBe(27));
    await act(async () => {
      await result.current.restore.mutateAsync(snapshot!);
    });
    await waitFor(() => expect(result.current.counts.data?.all).toBe(28));
  });
});
