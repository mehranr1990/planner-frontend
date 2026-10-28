import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createMockRepositories } from "@/data/mock";
import { DataProvider } from "@/data/provider";
import { renderWithProviders } from "@/test/render";
import { BrainDumpScreen } from "./brain-dump-screen";

function renderBrainDump(fixtures?: Parameters<typeof createMockRepositories>[0]) {
  const repositories = createMockRepositories(fixtures);
  const view = renderWithProviders(
    <DataProvider repositories={repositories}>
      <BrainDumpScreen />
    </DataProvider>,
  );
  return { ...view, repositories };
}

describe("BrainDumpScreen (P08)", () => {
  it("shows today's page with sorted tags, the pages list and the voice notch", async () => {
    renderBrainDump();
    expect(screen.getByRole("heading", { level: 1, name: "Brain Dump" })).toBeInTheDocument();
    expect(await screen.findByDisplayValue("dentist!!")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open Task · Thu/ })).toHaveAttribute("href", "/personal/tasks");
    expect(screen.getByRole("link", { name: /Today/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Voice capture" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Save status" })).toHaveTextContent(/Saved/);
  });

  it("sends the rest to the Inbox", async () => {
    const { repositories } = renderBrainDump();
    await userEvent.click(await screen.findByRole("button", { name: "Send rest to Inbox" }));
    await waitFor(async () => expect((await repositories.brainDump.pages())[0]?.unsortedCount).toBe(0));
    expect((await repositories.inbox.list("untriaged")).filter((item) => item.text === "dentist!!")).toHaveLength(1);
  });

  it("an empty page has no buttons until something is written", async () => {
    renderBrainDump({ fixtures: { brainDump: [] } });
    expect(await screen.findByPlaceholderText("What’s on your mind?")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send rest to Inbox" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear sorted" })).not.toBeInTheDocument();
  });
});
