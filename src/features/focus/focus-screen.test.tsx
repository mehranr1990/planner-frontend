import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { setMockSearch } from "@/test/setup";
import { FOCUS_STORAGE_KEY, focusStore } from "./focus-store";
import { FocusScreen } from "./focus-screen";

let clockNow = 1_000_000;
const clock = () => clockNow;

beforeEach(() => {
  clockNow = 1_000_000;
  focusStore.reset();
});

describe("FocusScreen", () => {
  it("starts on ?task, pauses, resumes and finishes into the summary", async () => {
    const user = userEvent.setup();
    setMockSearch("task=t-ui-design");
    renderWithProviders(<FocusScreen clock={clock} />);

    expect(screen.getByRole("main", { name: "Focus" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Leave focus/ })).toHaveAttribute("href", "/personal/my-day");
    expect(await screen.findByRole("timer")).toHaveTextContent("25:00");
    expect(screen.getByRole("radiogroup", { name: "Timer mode" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Park a distraction" })).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(FOCUS_STORAGE_KEY)!)).toMatchObject({ taskId: "t-ui-design", status: "running" });

    clockNow += 6 * 60_000;
    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByRole("timer")).toHaveTextContent("19:00");
    expect(screen.getAllByRole("status").some((node) => node.textContent === "Timer paused")).toBe(true);

    await user.type(screen.getByRole("textbox", { name: "Distraction" }), "Reply to Sara{Enter}");
    expect(within(screen.getByRole("list", { name: "Parked distractions" })).getByText("Reply to Sara")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Resume" }));
    await user.click(screen.getByRole("button", { name: "Finish session" }));
    expect(await screen.findByRole("heading", { name: "Session complete" })).toBeInTheDocument();
    expect(screen.getByText("1 distraction parked")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to My Day" })).toHaveAttribute("href", "/personal/my-day");
  });

  it("moves to a waiting break when the focus phase runs out (autoStartNext off)", async () => {
    setMockSearch("task=t-ui-design");
    renderWithProviders(<FocusScreen clock={clock} />);
    await screen.findByRole("timer");
    await act(async () => {
      clockNow += 26 * 60_000;
      await new Promise((resolve) => setTimeout(resolve, 1100));
    });
    expect(await screen.findByRole("heading", { name: "Step away for a moment" })).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("05:00");
    expect(screen.getByRole("button", { name: "Start break" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip break" })).toBeInTheDocument();
  });

  it("asks what to focus on without a task, and runs just a timer", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FocusScreen clock={clock} />);
    await user.click(await screen.findByRole("button", { name: "Just a timer" }));
    expect(await screen.findByRole("heading", { name: "Just a timer" })).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("25:00");
  });
});
