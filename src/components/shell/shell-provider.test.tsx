import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { sampleProfile, sampleWorkspaces } from "@/fixtures/shell";
import { renderWithProviders } from "@/test/render";
import { ShellProvider, useActiveWorkspace, useShell } from "./shell-provider";

const account = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/features/auth/account-provider", () => ({ useAccount: () => account.current }));

function Probe() {
  const { profile, sample } = useShell();
  const personal = useActiveWorkspace("personal");
  return (
    <p>
      {profile.name}|{profile.detail}|{personal?.id}|{personal?.name}|{String(sample)}
    </p>
  );
}

const renderProbe = () =>
  renderWithProviders(
    <ShellProvider workspaces={sampleWorkspaces} profile={sampleProfile} sample>
      <Probe />
    </ShellProvider>,
  );

describe("ShellProvider account", () => {
  it("keeps the sample profile and workspaces without an account (mock mode)", () => {
    account.current = null;
    renderProbe();
    expect(screen.getByText(`${sampleProfile.name}|${sampleProfile.detail}|mehran|Mehran|true`)).toBeInTheDocument();
  });

  it("names the Personal workspace after the signed-in user and drops the sample flag", () => {
    account.current = { user: { name: " Sara ", email: "sara@example.com" }, space: { id: "space-1" } };
    renderProbe();
    expect(screen.getByText("Sara|sara@example.com|space-1|Sara|false")).toBeInTheDocument();
  });

  it("falls back to the email when the account has no name", () => {
    account.current = { user: { name: "", email: "sara@example.com" }, space: undefined };
    renderProbe();
    expect(screen.getByText("|sara@example.com|personal|sara@example.com|false")).toBeInTheDocument();
  });
});
