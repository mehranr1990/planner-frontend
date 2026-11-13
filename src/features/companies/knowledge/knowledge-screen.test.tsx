import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import { renderCompanyScreen } from "../test-utils";
import { KnowledgeScreen } from "./knowledge-screen";

afterEach(() => resetToasts());

describe("CO-07 · Knowledge base", () => {
  it("hides restricted folders, shows the page with versions and the acknowledgement", async () => {
    const user = userEvent.setup();
    renderCompanyScreen(<KnowledgeScreen />, { path: "/companies/euroly/knowledge/kp-security" });
    const page = await screen.findByRole("article", { name: "Security policy" });
    expect(page).toHaveTextContent("61 of 82 people acknowledged v4");
    expect(screen.queryByText("HR")).not.toBeInTheDocument();
    await user.click(within(page).getByRole("button", { name: "Acknowledge" }));
    await waitFor(() => expect(screen.getByRole("article", { name: "Security policy" })).toHaveTextContent("62 of 82 people acknowledged v4"));
    await user.click(screen.getByRole("button", { name: "Remind" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Reminded" })).toBeDisabled());
  });

  it("diffs an older version and restores it as a new version", async () => {
    const user = userEvent.setup();
    renderCompanyScreen(<KnowledgeScreen />, { path: "/companies/euroly/knowledge/kp-security" });
    const versions = await screen.findByRole("complementary", { name: "Versions" });
    await user.click(within(versions).getAllByRole("button", { name: "Diff" })[0]!);
    expect(await screen.findByRole("region", { name: "Changes since v3" })).toHaveTextContent("Company data stays in company tools");
    await user.click(within(versions).getByRole("button", { name: "Restore v3 as a new version" }));
    await waitFor(() => expect(screen.getByRole("article", { name: "Security policy" })).toHaveTextContent("v5"));
  });

  it("searches only readable pages", async () => {
    const user = userEvent.setup();
    renderCompanyScreen(<KnowledgeScreen />, { path: "/companies/euroly/knowledge" });
    const search = await screen.findByRole("searchbox", { name: "Search all pages and files" });
    await user.type(search, "hiring");
    expect(await screen.findByText("Nothing readable matches.")).toBeInTheDocument();
    await user.clear(search);
    await user.type(search, "release");
    const results = await screen.findByRole("region", { name: "Search results" });
    expect((await within(results).findAllByRole("link", { name: /Release checklist/ }))[0]).toHaveAttribute("href", "/companies/euroly/knowledge/kp-release");
  });
});
