import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { setMockPathname, setMockSearch } from "@/test/setup";
import { TaskCreateScreen } from "./task-create-screen";

function open(search: string) {
  setMockPathname("/personal/tasks/create");
  setMockSearch(search);
  return renderWithProviders(<TaskCreateScreen />);
}

describe("TaskCreateScreen (P05)", () => {
  it("is prefilled from Quick Add and ends on Done", async () => {
    const user = userEvent.setup();
    open("title=Call+mom&duration=15&priority=high&from=%2Fpersonal%2Ftasks");
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Call mom");
    expect(within(screen.getByRole("radiogroup", { name: "Priority" })).getByRole("radio", { name: "High" })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("button", { name: /Create task/ }));
    expect(await screen.findByRole("heading", { name: "Added without a date" })).toHaveFocus();
    expect(screen.getByRole("link", { name: "Go back" })).toHaveAttribute("href", "/personal/tasks");
  });

  it("asks for a title instead of creating an empty task", async () => {
    const user = userEvent.setup();
    open("");
    await user.click(screen.getByRole("button", { name: /Create task/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("Give the task a title");
  });
});
