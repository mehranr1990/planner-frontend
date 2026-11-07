import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { setMockPathname, setMockSearch } from "@/test/setup";
import { ProjectGate } from "../project-gate";
import { FilesScreen } from "./files-screen";

function renderFiles(search = "") {
  setMockPathname("/projects/website-redesign/files");
  setMockSearch(search);
  return renderWithProviders(
    <ProjectGate>
      <FilesScreen />
    </ProjectGate>,
  );
}

describe("PJ-10 · Files", () => {
  it("folders with counts, file rows with upload states and the preview with Download", async () => {
    renderFiles();
    const folders = await screen.findByRole("navigation", { name: "Folders" });
    expect(within(folders).getByRole("button", { name: /All files\s*18/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(folders).getByRole("button", { name: /Design\s*7/ })).toBeInTheDocument();
    expect(screen.getAllByText("Scanning… download off").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Not allowed type").length).toBeGreaterThan(0);
    const preview = screen.getByRole("heading", { level: 2, name: "Checkout — final.fig" }).closest("section")!;
    expect(preview).toHaveAttribute("data-notch-actions", "1");
    expect(within(preview).getByRole("button", { name: "Download" })).not.toHaveAttribute("aria-disabled");
    expect(preview).toHaveTextContent("final colours");
    await waitFor(() => expect(preview).toHaveTextContent("Design QA handoff"));
    expect(screen.getByRole("button", { name: /Drop files here/ })).toBeInTheDocument();
    expect(screen.queryByText(/storage/i)).not.toBeInTheDocument();
  });

  it("download is disabled with the reason while scanning; filters narrow the list", async () => {
    const user = userEvent.setup();
    renderFiles("file=api-notes");
    const preview = (await screen.findByRole("heading", { level: 2, name: "API notes.docx" })).closest("section")!;
    const download = within(preview).getByRole("button", { name: "Download" });
    expect(download).toHaveAttribute("aria-disabled", "true");
    expect(download).toHaveAccessibleDescription("Download is off until the scan finishes");
    await user.click(screen.getByRole("radio", { name: "Images" }));
    const list = screen.getByRole("heading", { name: "All files", level: 2 }).closest("section")!;
    expect(within(list).queryByText("API notes.docx")).not.toBeInTheDocument();
    expect(within(list).getByText("Home hero.png")).toBeInTheDocument();
  });

  it("empty state and guest view (only shared files, other folders not listed)", async () => {
    const { unmount } = renderFiles("state=empty");
    expect(await screen.findByRole("heading", { name: "No files yet" })).toBeInTheDocument();
    unmount();
    renderFiles("state=guest");
    const folders = await screen.findByRole("navigation", { name: "Folders" });
    expect(within(folders).queryByRole("button", { name: /Design/ })).not.toBeInTheDocument();
    expect(within(folders).getByRole("button", { name: /Shared with guests/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Upload" })).not.toBeInTheDocument();
  });
});
