import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { PillCount } from "./pills";
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

  it("renders compact pill tabs: outlined, soft tint below lg, ink outline from lg", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Tabs defaultValue="today">
        <TabsList variant="pills" aria-label="Due">
          <TabsTrigger value="today" variant="pills">
            Today
          </TabsTrigger>
          <TabsTrigger value="overdue" variant="pills">
            Overdue <PillCount count={1} />
          </TabsTrigger>
        </TabsList>
        <TabsContent value="today">Today panel</TabsContent>
        <TabsContent value="overdue">Overdue panel</TabsContent>
      </Tabs>,
    );
    const list = screen.getByRole("tablist", { name: "Due" });
    expect(list).toHaveClass("flex-wrap", "gap-1.5");
    expect(list).not.toHaveClass("bg-surface");
    const overdue = screen.getByRole("tab", { name: "Overdue 1" });
    // 34px visual capsule, 48px hit area through ::after.
    expect(overdue).toHaveClass("h-8.5", "px-3.5", "text-xs", "font-bold", "inset-ring", "inset-ring-outline", "after:-inset-y-1.75");
    expect(overdue.className).toContain("[&:is([data-state=active],[data-state=on])]:bg-scope-soft");
    expect(overdue.className).toContain("lg:[&:is([data-state=active],[data-state=on])]:inset-ring-fg");
    expect(screen.getByText("1")).toHaveClass("text-fg-muted", "tabular");
    expect(overdue).toHaveAttribute("data-state", "inactive");
    await user.click(overdue);
    expect(overdue).toHaveAttribute("aria-selected", "true");
    expect(overdue).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Overdue panel");
  });

  it("keeps `compact` as a deprecated alias of pills", () => {
    renderWithProviders(
      <>
        <Tabs defaultValue="a">
          <TabsList variant="compact" aria-label="Old">
            <TabsTrigger value="a" variant="compact">
              A
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs defaultValue="b">
          <TabsList variant="pills" aria-label="New">
            <TabsTrigger value="b" variant="pills">
              B
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </>,
    );
    expect(screen.getByRole("tablist", { name: "Old" }).className).toBe(screen.getByRole("tablist", { name: "New" }).className);
    expect(screen.getByRole("tab", { name: "A" }).className).toBe(screen.getByRole("tab", { name: "B" }).className);
  });

  it("renders filled pill tabs with the active mode in primary", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Tabs defaultValue="focus">
        <TabsList variant="filled" aria-label="Timer mode">
          <TabsTrigger value="focus" variant="filled">
            Focus
          </TabsTrigger>
          <TabsTrigger value="short" variant="filled">
            Short break
          </TabsTrigger>
        </TabsList>
        <TabsContent value="focus">Focus panel</TabsContent>
        <TabsContent value="short">Short panel</TabsContent>
      </Tabs>,
    );
    const short = screen.getByRole("tab", { name: "Short break" });
    expect(short).toHaveClass("h-9", "px-3.5", "font-bold", "bg-canvas", "text-fg", "after:-inset-y-1.5");
    expect(short.className).toContain("[&:is([data-state=active],[data-state=on])]:bg-primary");
    expect(short.className).toContain("[&:is([data-state=active],[data-state=on])]:text-on-accent");
    await user.click(short);
    expect(short).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Short panel");
  });
});
