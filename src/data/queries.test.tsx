import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { createMockRepositories } from "./mock";
import { DataProvider, useRepositories } from "./provider";
import { blockKeys, inboxKeys, taskKeys, useBlocks, useInboxCount, useTask, useTasks } from "./queries";
import type { Repositories } from "./repositories";

function wrapper(repositories?: Repositories) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <DataProvider repositories={repositories}>{children}</DataProvider>
      </QueryClientProvider>
    );
  };
}

describe("query keys", () => {
  it("nest under their family and normalise task queries", () => {
    expect(taskKeys.list({})).toEqual(taskKeys.list({ view: undefined }));
    expect(taskKeys.list({ view: "today" }).slice(0, 2)).toEqual(taskKeys.lists());
    expect(taskKeys.detail("t-1").slice(0, 1)).toEqual(taskKeys.all);
    expect(blockKeys.day("2026-10-13")).toEqual(["blocks", "day", "2026-10-13"]);
    expect(inboxKeys.count()).toEqual(["inbox", "count"]);
  });
});

describe("data hooks", () => {
  it("useTasks reads the view from the repository", async () => {
    const { result } = renderHook(() => useTasks({ view: "upcoming" }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((task) => task.id)).toEqual([
      "t-5km-run",
      "t-finish-finance-report",
      "t-reply-to-client",
      "t-call-dentist",
      "t-haircut",
      "t-renew-car-insurance",
      "t-monthly-budget-review",
    ]);
  });

  it("useTask stays idle without an id and resolves null for an unknown one", async () => {
    const idle = renderHook(() => useTask(null), { wrapper: wrapper() });
    expect(idle.result.current.fetchStatus).toBe("idle");

    const missing = renderHook(() => useTask("t-missing"), { wrapper: wrapper() });
    await waitFor(() => expect(missing.result.current.isSuccess).toBe(true));
    expect(missing.result.current.data).toBeNull();
  });

  it("useBlocks and useInboxCount serve the sample day", async () => {
    const { result } = renderHook(() => ({ blocks: useBlocks("2026-10-13"), inbox: useInboxCount() }), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.inbox.isSuccess && result.current.blocks.isSuccess).toBe(true));
    expect(result.current.inbox.data).toBe(6);
    expect(result.current.blocks.data).toHaveLength(7);
  });

  it("DataProvider swaps the source: hooks call the repositories they are given", async () => {
    const mock = createMockRepositories();
    const repositories: Repositories = { ...mock, inbox: { ...mock.inbox, count: vi.fn(async () => 42) } };
    const { result } = renderHook(() => useInboxCount(), { wrapper: wrapper(repositories) });
    await waitFor(() => expect(result.current.data).toBe(42));
    expect(repositories.inbox.count).toHaveBeenCalledOnce();
  });

  it("DataProvider keeps one repositories instance across renders", () => {
    const { result, rerender } = renderHook(() => useRepositories(), { wrapper: wrapper() });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("useRepositories throws outside DataProvider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useRepositories())).toThrow(/DataProvider/);
    vi.restoreAllMocks();
  });
});
