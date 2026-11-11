import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import { renderWithProviders } from "@/test/render";
import { setMockPathname, setMockSearch } from "@/test/setup";
import { TeamGate } from "../team-gate";
import { RecognitionScreen } from "./recognition-screen";

function renderRecognition(team = "design", search = "") {
  setMockPathname(`/teams/${team}/recognition`);
  setMockSearch(search);
  return renderWithProviders(
    <TeamGate>
      <RecognitionScreen />
    </TeamGate>,
  );
}

afterEach(() => resetToasts());

describe("TM-10 · Thanks & feedback", () => {
  it("feed: team thanks + private thanks to me, link chips, no counts per person", async () => {
    renderRecognition();
    const feed = await screen.findByRole("region", { name: "Thanks feed" });
    const cards = within(feed).getAllByRole("article");
    expect(cards).toHaveLength(4);
    expect(within(cards[1]!).getByText("Only you")).toBeInTheDocument();
    expect(within(cards[2]!).getByText("Planner App")).toBeInTheDocument();
    expect(screen.queryByText(/top contributor|leaderboard|thanks received/i)).not.toBeInTheDocument();
  });

  it("composer: pick a teammate, choose Only them, notch Send thanks puts it on top", async () => {
    const user = userEvent.setup();
    renderRecognition();
    await screen.findByRole("region", { name: "Thanks feed" });
    await user.click(screen.getByRole("button", { name: "Add a teammate" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Sarah P." }));
    await user.keyboard("{Escape}");
    await user.type(screen.getByLabelText("What are you thanking them for?"), "Your icon audit saved us a week.");
    await user.click(screen.getByRole("radio", { name: "Only Sarah P." }));
    await user.click(screen.getByRole("button", { name: "Send thanks" }));
    expect(await screen.findByText("Thanks sent")).toBeInTheDocument();
    const feed = screen.getByRole("region", { name: "Thanks feed" });
    await waitFor(() => expect(within(within(feed).getAllByRole("article")[0]!).getByText("Your icon audit saved us a week.")).toBeInTheDocument());
    expect(within(within(feed).getAllByRole("article")[0]!).getByText("Only Sarah P.")).toBeInTheDocument();
  });

  it("feedback: answer a request privately; the Feedback view lists only what involves me", async () => {
    const user = userEvent.setup();
    renderRecognition();
    const side = await screen.findByRole("complementary", { name: "Feedback" });
    await user.click(await within(side).findByRole("button", { name: "Write" }));
    const dialog = await screen.findByRole("dialog", { name: "Write feedback" });
    await user.type(within(dialog).getByRole("textbox", { name: "Feedback" }), "Cut the third variant.");
    await user.click(within(dialog).getByRole("button", { name: "Send feedback" }));
    expect(await screen.findByText("Feedback sent")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Feedback" }));
    expect(await screen.findByText("Sent")).toBeInTheDocument();
    expect(screen.queryByText("Private to Sarah and Harry only.")).not.toBeInTheDocument();
    expect(screen.getByText(/Never shown to Leads by default/)).toBeInTheDocument();
  });

  it("Viewer: reads thanks only — no composer, no feedback", async () => {
    renderRecognition("design", "state=read-only");
    await screen.findByRole("region", { name: "Thanks feed" });
    expect(screen.getByText("Viewers read thanks.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send thanks" })).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Feedback" })).not.toBeInTheDocument();
  });
});
