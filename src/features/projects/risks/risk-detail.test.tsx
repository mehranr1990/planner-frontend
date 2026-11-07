import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { routerReplace, setMockPathname, setMockSearch } from "@/test/setup";
import { ProjectGate } from "../project-gate";
import { RiskDetailView } from "./risk-detail-view";

function renderRisk(riskId: string, search = "") {
  setMockPathname(`/projects/website-redesign/risks/${riskId}`);
  setMockSearch(search);
  return renderWithProviders(
    <ProjectGate>
      <RiskDetailView riskId={riskId} variant="page" />
    </ProjectGate>,
  );
}

describe("PJ-16 · Risk detail", () => {
  it("head chips, notch Close risk, properties and the mitigation checklist", async () => {
    renderRisk("payment-api-delay");
    const heading = await screen.findByRole("heading", { level: 1, name: /Payment API access delayed/ });
    const head = heading.closest("section")!;
    expect(head).toHaveAttribute("data-notch-actions", "1");
    expect(head).toHaveTextContent("Probability · High");
    expect(head).toHaveTextContent("Mitigating");
    expect(head).toHaveTextContent("Payment go-live");
    expect(within(head).getByRole("button", { name: "Close risk" })).toBeInTheDocument();
    const props = await screen.findByLabelText("Risk properties");
    expect(props).toHaveTextContent("Kian F.");
    expect(props).toHaveTextContent("No live keys by 20 Oct");
    await waitFor(() => expect(props).toHaveTextContent("Checkout flow"));
    const tabs = screen.getByRole("tablist", { name: "Risk sections" });
    expect(within(tabs).getByRole("tab", { name: /Mitigation/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("checkbox", { name: "Escalation email sent" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Make task: Feature flag for go-live" })).toBeInTheDocument();
  });

  it("closes a risk with a reason chip", async () => {
    const user = userEvent.setup();
    renderRisk("payment-api-delay");
    await user.click(await screen.findByRole("button", { name: "Close risk" }));
    const dialog = await screen.findByRole("dialog", { name: "Close risk" });
    await user.click(within(dialog).getByRole("radio", { name: "Did not happen" }));
    await user.click(within(dialog).getByRole("button", { name: "Close risk" }));
    expect(await screen.findByText("Closed · Did not happen")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
  });

  it("converts to issue I-03 and opens it", async () => {
    const user = userEvent.setup();
    renderRisk("payment-api-delay");
    await user.click(await screen.findByRole("button", { name: "Convert to issue" }));
    const dialog = await screen.findByRole("dialog", { name: "Convert to issue" });
    expect(dialog).toHaveTextContent("Creates issue I-03 “Payment API access delayed” with severity High");
    await user.click(within(dialog).getByRole("button", { name: "Convert" }));
    await waitFor(() =>
      expect(routerReplace).toHaveBeenCalledWith("/projects/website-redesign/risks/issue-payment-api-delay"),
    );
  });

  it("issue head = Resolve (note required); viewer gets Copy link and no comment box", async () => {
    const user = userEvent.setup();
    const { unmount } = renderRisk("staging-deploy");
    expect(await screen.findByRole("link", { name: "From risk R-06" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Resolve" }));
    const dialog = await screen.findByRole("dialog", { name: "Resolve" });
    expect(within(dialog).getByRole("button", { name: "Resolve" })).toBeDisabled();
    unmount();
    renderRisk("payment-api-delay", "state=read-only");
    await screen.findByRole("heading", { level: 1, name: /Payment API access delayed/ });
    expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Convert to issue" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /Comments/ }));
    expect(screen.queryByPlaceholderText("Add a comment")).not.toBeInTheDocument();
  });
});
