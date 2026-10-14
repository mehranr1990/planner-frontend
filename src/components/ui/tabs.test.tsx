import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

function Example({ onValueChange }: { onValueChange?: (value: string) => void }) {
  return (
    <Tabs defaultValue="week" onValueChange={onValueChange}>
      <TabsList aria-label="View">
        <TabsTrigger value="day">Day</TabsTrigger>
        <TabsTrigger value="week">Week</TabsTrigger>
        <TabsTrigger value="month" disabled>
          Month
        </TabsTrigger>
        <TabsTrigger value="agenda">Agenda</TabsTrigger>
      </TabsList>
      <TabsContent value="day">Day panel</TabsContent>
      <TabsContent value="week">Week panel</TabsContent>
      <TabsContent value="month">Month panel</TabsContent>
      <TabsContent value="agenda">Agenda panel</TabsContent>
    </Tabs>
  );
}

describe("Tabs", () => {
  it("exposes tablist, tab and tabpanel roles with the capsule look", () => {
    renderWithProviders(<Example />);
    const list = screen.getByRole("tablist", { name: "View" });
    expect(list.className).toContain("rounded-pill");
    expect(list.className).toContain("bg-raised");
    const week = screen.getByRole("tab", { name: "Week" });
    expect(week).toHaveAttribute("aria-selected", "true");
    expect(week.className).toContain("min-h-touch");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Week panel");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", week.id);
  });

  it("switches panels on click and reports the value", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    renderWithProviders(<Example onValueChange={onValueChange} />);
    await user.click(screen.getByRole("tab", { name: "Day" }));
    expect(onValueChange).toHaveBeenCalledWith("day");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Day panel");
  });

  it("moves with arrow keys, skipping disabled tabs", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Example />);
    await user.click(screen.getByRole("tab", { name: "Week" }));
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Agenda" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Month" })).toBeDisabled();
    await user.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "Day" })).toHaveFocus();
  });

  it("mirrors arrow keys in RTL", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Example />, { preferences: { locale: "fa", direction: "rtl", digits: "fa" } });
    await user.click(screen.getByRole("tab", { name: "Day" }));
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Week" })).toHaveFocus();
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Week panel");
  });

  it("renders unstyled triggers for sculpted tab rows", () => {
    renderWithProviders(
      <Tabs defaultValue="a">
        <TabsList variant="unstyled" className="flex">
          <TabsTrigger variant="unstyled" value="a" className="custom">
            A
          </TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    expect(screen.getByRole("tab", { name: "A" }).className).toBe("custom");
    expect(screen.getByRole("tablist").className).toBe("flex");
  });

  it("renders compact tabs (S4 project views) with the active tab in the scope tint", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Tabs defaultValue="overview">
        <TabsList variant="compact" aria-label="Project views">
          <TabsTrigger value="overview" variant="compact">
            Overview
          </TabsTrigger>
          <TabsTrigger value="board" variant="compact">
            Board
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview">Overview panel</TabsContent>
        <TabsContent value="board">Board panel</TabsContent>
      </Tabs>,
    );
    const list = screen.getByRole("tablist", { name: "Project views" });
    expect(list.className).toContain("bg-surface");
    const board = screen.getByRole("tab", { name: "Board" });
    expect(board.className).toContain("data-[state=active]:bg-scope-soft");
    await user.click(board);
    expect(board).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Board panel");
  });
});
