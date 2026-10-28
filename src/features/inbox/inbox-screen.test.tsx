import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import { createMockRepositories } from "@/data/mock";
import { DataProvider } from "@/data/provider";
import { renderWithProviders } from "@/test/render";
import { InboxScreen } from "./inbox-screen";

function renderInbox(options: Parameters<typeof renderWithProviders>[1] = {}) {
  const repositories = createMockRepositories();
  const view = renderWithProviders(
    <DataProvider repositories={repositories}>
      <InboxScreen />
    </DataProvider>,
    options,
  );
  return { ...view, repositories };
}

const processCard = () => document.querySelector<HTMLElement>('[data-slot="inbox-process"]')!;

describe("InboxScreen (P07)", () => {
  it("lists the triage items and walks them in the Process card", async () => {
    renderInbox();
    expect(screen.getByRole("heading", { level: 1, name: "Inbox" })).toBeInTheDocument();
    expect(await screen.findByText("Processing · 1 of 6")).toBeInTheDocument();
    expect(within(processCard()).getByRole("heading", { name: /Call Ali about the apartment lease/ })).toBeInTheDocument();
    expect(within(processCard()).getByRole("button", { name: /Task/ })).toHaveAttribute("data-suggested", "true");
    await userEvent.click(screen.getByRole("button", { name: "Skip to the next item" }));
    expect(await screen.findByText("Processing · 2 of 6")).toBeInTheDocument();
  });

  it("converts with T (a task from Inbox), archives, and keeps the badge on untriaged items", async () => {
    const { repositories } = renderInbox();
    await screen.findByText("Processing · 1 of 6");
    await userEvent.keyboard("t");
    expect(await screen.findByText("Converted to task")).toBeInTheDocument();
    const tasks = await repositories.tasks.list({ view: "all" });
    const created = tasks.find((task) => task.title === "Call Ali about the apartment lease before Friday");
    expect(created?.activity?.[0]).toMatchObject({ kind: "created", source: "inbox-voice" });
    await waitFor(() => expect(screen.getByText("Processing · 1 of 5")).toBeInTheDocument());
    await userEvent.click(within(processCard()).getByRole("button", { name: "Archive" }));
    await waitFor(async () => expect(await repositories.inbox.count()).toBe(4));
  });

  it("J appends the item to today's Journal entry; Undo restores the entry and the item", async () => {
    resetToasts();
    const { repositories } = renderInbox();
    await screen.findByText("Processing · 1 of 6");
    await userEvent.keyboard("j");
    expect(await screen.findByText("Added to today’s Journal entry.")).toBeInTheDocument();
    await waitFor(async () => expect((await repositories.journal.entry("2026-10-13"))?.text).toContain("Call Ali about the apartment lease"));
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(async () => expect((await repositories.journal.entry("2026-10-13"))?.text).toBe(""));
    await waitFor(async () => expect(await repositories.inbox.count()).toBe(6));
  });

  it("speaks Persian", async () => {
    renderInbox({ preferences: { locale: "fa", direction: "rtl", digits: "fa" } });
    expect(screen.getByRole("heading", { level: 1, name: "صندوق ورودی" })).toBeInTheDocument();
    expect(await screen.findByText("در حال رسیدگی · ۱ از ۶")).toBeInTheDocument();
  });
});
