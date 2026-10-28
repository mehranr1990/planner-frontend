import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createMockRepositories } from "@/data/mock";
import { DataProvider } from "@/data/provider";
import { sampleDays } from "@/fixtures/personal";
import { renderWithProviders } from "@/test/render";
import { ShutdownScreen } from "./shutdown-screen";

function renderShutdown(options: Parameters<typeof renderWithProviders>[1] = {}) {
  const repositories = createMockRepositories();
  const view = renderWithProviders(
    <DataProvider repositories={repositories}>
      <ShutdownScreen />
    </DataProvider>,
    options,
  );
  return { ...view, repositories };
}

describe("ShutdownScreen (P10)", () => {
  it("routes unfinished tasks, saves the reflection and closes the day", async () => {
    const { repositories } = renderShutdown();
    expect(screen.getByRole("heading", { level: 1, name: "Finish your day" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /^Unfinished · \d+$/ })).toBeInTheDocument();
    const open = (await repositories.tasks.list({ view: "today", day: sampleDays.today })).filter((task) => task.status === "open");
    expect(open.length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("button", { name: "Good" }));
    await userEvent.click(screen.getAllByRole("button", { name: /Finish day/ }).at(-1)!);

    expect(await screen.findByRole("heading", { name: "Day closed" })).toBeInTheDocument();
    const moved = await Promise.all(open.map((task) => repositories.tasks.get(task.id)));
    expect(moved.every((task) => task?.date === sampleDays.tomorrow)).toBe(true);
    await waitFor(async () =>
      expect((await repositories.journal.moods(sampleDays.today, sampleDays.today))[0]).toMatchObject({ mood: 4 }),
    );
  });

  it("speaks Persian", async () => {
    renderShutdown({ preferences: { locale: "fa", direction: "rtl", digits: "fa" } });
    expect(screen.getByRole("heading", { level: 1, name: "روزت را ببند" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /^ناتمام · [۰-۹]+$/ })).toBeInTheDocument();
  });
});
