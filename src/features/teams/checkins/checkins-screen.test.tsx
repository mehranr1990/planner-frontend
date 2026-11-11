import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import { renderWithProviders } from "@/test/render";
import { setMockPathname, setMockSearch } from "@/test/setup";
import { TeamGate } from "../team-gate";
import { CheckinsScreen } from "./checkins-screen";

function renderCheckins(team = "design", search = "") {
  setMockPathname(`/teams/${team}/check-ins`);
  setMockSearch(search);
  return renderWithProviders(
    <TeamGate>
      <CheckinsScreen />
    </TeamGate>,
  );
}

afterEach(() => resetToasts());

describe("TM-09 · Check-ins", () => {
  it("three questions with done-task suggestions; notch Send → Edit check-in; no mood or streaks", async () => {
    const user = userEvent.setup();
    renderCheckins();
    const did = await screen.findByLabelText("What did you do?");
    expect(screen.getByLabelText("What will you do next?")).toBeInTheDocument();
    expect(screen.getByLabelText("Anything blocking you?")).toBeInTheDocument();
    expect(screen.queryByText(/mood|streak|score/i)).not.toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "Add “Critique notes W41”" }));
    expect(did).toHaveValue("Critique notes W41");
    expect(screen.getByRole("button", { name: "Add “Critique notes W41”" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getAllByRole("button", { name: "Send check-in" })[0]!);
    expect(await screen.findByText(/Check-in sent · editable until/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit check-in" })).toBeInTheDocument();
    expect(screen.getByText("6 of 7 replied")).toBeInTheDocument();
  });

  it("replies newest first with comments; Make task from blocker; who replied shows counts and who is off", async () => {
    const user = userEvent.setup();
    renderCheckins();
    const replies = await screen.findAllByRole("article");
    expect(within(replies[0]!).getByText("Katy F.")).toBeInTheDocument();
    expect(screen.getByText("5 of 7 replied")).toBeInTheDocument();
    expect(screen.getByText(/not yet · Nina T\. is off/)).toBeInTheDocument();
    // Members never remind.
    expect(screen.queryByRole("button", { name: /^Remind/ })).not.toBeInTheDocument();

    await user.click(within(replies[0]!).getByRole("button", { name: "Make task from blocker" }));
    expect(await within(replies[0]!).findByRole("button", { name: "Task created from the blocker" })).toBeDisabled();

    const sarah = replies.find((card) => within(card).queryByText("Sarah P."))!;
    await user.click(within(sarah).getByRole("button", { name: "1 comment" }));
    await user.type(within(sarah).getByRole("textbox", { name: "Comment on Sarah P.’s check-in" }), "Nice");
    await user.click(within(sarah).getByRole("button", { name: "Post" }));
    await waitFor(() => expect(within(sarah).getByText("Nice")).toBeInTheDocument());
  });

  it("Lead reminds non-responders once per week; previous week is closed and read-only", async () => {
    const user = userEvent.setup();
    renderCheckins("mobile");
    const remind = await screen.findByRole("button", { name: "Remind 3 people" });
    await user.click(remind);
    expect(await screen.findByRole("button", { name: "Reminded this week" })).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: "W41" }));
    expect(await screen.findByText("You didn’t reply this week.")).toBeInTheDocument();
    expect(screen.queryByLabelText("What did you do?")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to W42" })).toBeInTheDocument();
  });

  it("Viewer: reads replies, no form", async () => {
    renderCheckins("design", "state=read-only");
    expect(await screen.findByText("Viewers read replies; no form.")).toBeInTheDocument();
    expect(screen.queryByLabelText("What did you do?")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Make task from blocker" })).not.toBeInTheDocument();
  });
});
