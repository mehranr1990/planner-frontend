import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import { createMockRepositories } from "@/data/mock";
import { DataProvider } from "@/data/provider";
import { DEFAULT_PLANNER_SETTINGS } from "@/features/planner-settings/planner-settings";
import { renderWithProviders } from "@/test/render";
import { nextPrompt, resolveJournalDay } from "./domain/journal";
import { JournalScreen } from "./journal-screen";

function renderJournal(date: string | null = null, options: Parameters<typeof renderWithProviders>[1] & { fixtures?: Parameters<typeof createMockRepositories>[0] } = {}) {
  const { fixtures, ...rest } = options;
  const repositories = createMockRepositories(fixtures);
  const view = renderWithProviders(
    <DataProvider repositories={repositories}>
      <JournalScreen date={date} />
    </DataProvider>,
    rest,
  );
  return { ...view, repositories };
}

describe("Journal rules (P14)", () => {
  it("shows today for a missing, malformed or future date; prompts go in order", () => {
    expect(resolveJournalDay(null, "2026-10-13")).toBe("2026-10-13");
    expect(resolveJournalDay("nope", "2026-10-13")).toBe("2026-10-13");
    expect(resolveJournalDay("2026-10-20", "2026-10-13")).toBe("2026-10-13");
    expect(resolveJournalDay("2026-10-11", "2026-10-13")).toBe("2026-10-11");
    expect(nextPrompt([{ id: "grateful", answer: "" }])).toBe("energy");
  });
});

describe("JournalScreen (P14)", () => {
  it("writing first: one signature composer with the cursor ready, the terrain, and Recent with a check-in-only entry", async () => {
    const { container } = renderJournal();
    const composer = await screen.findByRole("region", { name: /Today/ });
    expect(within(composer).getByRole("textbox", { name: "Reflection" })).toHaveFocus();
    expect(within(composer).getByRole("button", { name: "Good" })).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelectorAll('[data-slot="signature-surface"]')).toHaveLength(1);
    await waitFor(() => expect(container.querySelector('[data-slot="mood-terrain"]')).toBeInTheDocument());
    const list = await screen.findByRole("list", { name: "Entries" });
    expect(within(list).getByText(/Long walk after work/)).toBeInTheDocument();
    expect(within(list).getByText("#walk")).toBeInTheDocument();
  });

  it("auto-saves the reflection and tags to the day's entry", async () => {
    const user = userEvent.setup();
    const { repositories } = renderJournal();
    const composer = await screen.findByRole("region", { name: /Today/ });
    await user.type(within(composer).getByRole("textbox", { name: "Reflection" }), "Calm day");
    await user.click(within(composer).getByRole("button", { name: "Tag" }));
    await user.type(within(composer).getByRole("textbox", { name: "Tag" }), "#Calm{Enter}");
    await waitFor(async () => expect(await repositories.journal.entry("2026-10-13")).toMatchObject({ text: "Calm day", tags: ["calm"] }), { timeout: 2000 });
    expect(await within(composer).findByText(/Saved ·/)).toBeInTheDocument();
  });

  it("auto-save keeps a mood and an Inbox line written elsewhere while the composer was open", async () => {
    const user = userEvent.setup();
    const { repositories } = renderJournal();
    const composer = await screen.findByRole("region", { name: /Today/ });
    const reflection = within(composer).getByRole("textbox", { name: "Reflection" });
    await user.type(reflection, "Calm day");
    // Before the 600ms pause: the mood sheet and Inbox → Journal write the same entry.
    await repositories.journal.checkIn("2026-10-13", { mood: 2, energy: "low" });
    await repositories.journal.append("2026-10-13", "From Inbox");
    await waitFor(async () => expect(await repositories.journal.entry("2026-10-13")).toMatchObject({ mood: 2, energy: "low", text: "Calm day\nFrom Inbox" }), {
      timeout: 2000,
    });
    await waitFor(() => expect(reflection).toHaveValue("Calm day\nFrom Inbox"));
    await user.type(reflection, "!");
    await waitFor(async () => expect((await repositories.journal.entry("2026-10-13"))?.text).toBe("Calm day\nFrom Inbox!"), { timeout: 2000 });
    expect((await repositories.journal.entry("2026-10-13"))?.mood).toBe(2);
  });

  it("empty + sparse trend: no entries and fewer than 3 check-ins shows no terrain", async () => {
    const { container } = renderJournal(null, { fixtures: { fixtures: { moods: [], journal: [] } } });
    expect(await screen.findByText("Your mood trend appears after 3 check-ins.")).toBeInTheDocument();
    expect(container.querySelector('[data-slot="mood-terrain"]')).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "No entries yet" })).toBeInTheDocument();
  });

  it("locked: content stays hidden until Unlock, for this visit", async () => {
    const user = userEvent.setup();
    renderJournal(null, { plannerSettings: { ...DEFAULT_PLANNER_SETTINGS, privacy: { ...DEFAULT_PLANNER_SETTINGS.privacy, journalLock: true } } });
    expect(screen.getByRole("heading", { name: "Journal is locked" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Reflection" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    expect(await screen.findByRole("textbox", { name: "Reflection" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Lock" }));
    expect(screen.getByRole("heading", { name: "Journal is locked" })).toBeInTheDocument();
  });

  it("deleting an entry from Recent offers Undo", async () => {
    resetToasts();
    const user = userEvent.setup();
    const { repositories } = renderJournal();
    const list = await screen.findByRole("list", { name: "Entries" });
    await user.click(within(list).getAllByRole("button", { name: /Delete entry/ })[0]!);
    await waitFor(async () => expect(await repositories.journal.entry("2026-10-12")).toBeNull());
    await user.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(async () => expect((await repositories.journal.entry("2026-10-12"))?.tags).toEqual(["walk"]));
  });
});
