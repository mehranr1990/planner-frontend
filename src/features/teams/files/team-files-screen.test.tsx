import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { setMockPathname, setMockSearch } from "@/test/setup";
import { TeamGate } from "../team-gate";
import { TeamFilesScreen } from "./team-files-screen";

function renderFiles(team = "design", search = "") {
  setMockPathname(`/teams/${team}/files`);
  setMockSearch(search);
  return renderWithProviders(
    <TeamGate>
      <TeamFilesScreen />
    </TeamGate>,
  );
}

describe("TM-11 · Team files (PJ-10 component, team scope)", () => {
  it("team folders, rows with versions and a preview whose notch is Download", async () => {
    renderFiles();
    const folders = await screen.findByRole("navigation", { name: "Folders" });
    expect(within(folders).getByRole("button", { name: /All team files/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(folders).getByRole("button", { name: /Brand assets/ })).toBeInTheDocument();
    expect(screen.getByText("Project files stay in their projects. Open them from Projects.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Critique W41 notes\.pdf/ })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Download" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument();
    expect(screen.queryByText(/storage|quota/i)).not.toBeInTheDocument();
  });

  it("Viewers download only: no Upload", async () => {
    renderFiles("design", "state=read-only");
    await screen.findByRole("navigation", { name: "Folders" });
    expect(screen.queryByRole("button", { name: "Upload" })).not.toBeInTheDocument();
  });
});
