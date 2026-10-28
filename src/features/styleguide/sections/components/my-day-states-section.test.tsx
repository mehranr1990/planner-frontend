import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockViewport } from "@/features/my-day/states/test-utils";
import { renderWithProviders } from "@/test/render";
import { StyleguideMessages } from "../../styleguide-messages";
import { MyDayStatesSection } from "./my-day-states-section";

const TILES = [
  ["Current and completed", "/styleguide/my-day"],
  ["Empty day", "/styleguide/my-day?state=empty"],
  ["Overloaded day", "/styleguide/my-day?state=overloaded"],
  ["Partially planned", "/styleguide/my-day?state=partial"],
  ["No current block · Up next", "/styleguide/my-day?state=no-current"],
  ["After hours · 19:30", "/styleguide/my-day?state=after-hours"],
  ["Drag", "/styleguide/my-day"],
  ["Reschedule", "/styleguide/my-day?state=overloaded&reschedule=blk-t-od-client-prep"],
] as const;

function renderSection() {
  return renderWithProviders(
    <StyleguideMessages>
      <MyDayStatesSection />
    </StyleguideMessages>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("MyDayStatesSection", () => {
  it("lists every state with a link to its full-screen demo", () => {
    renderSection();
    const section = screen.getByRole("region", { name: "My Day · states" });
    const links = within(section).getAllByRole("link", { name: "Open full screen" });
    expect(links.map((link) => link.getAttribute("href"))).toEqual(TILES.map(([, href]) => href));
    for (const [name] of TILES) expect(within(section).getByText(name)).toBeInTheDocument();
  });

  it("leaves the tiles on a placeholder until they near the viewport", () => {
    renderSection();
    expect(screen.getAllByText("The state loads when you scroll to it.")).toHaveLength(TILES.length);
    expect(document.querySelector('[data-slot="time-block"]')).toBeNull();
  });

  it("mounts the tiles once visible: isolated stores, the drag picture and the Reschedule picture", async () => {
    mockViewport("desktop");
    const callbacks: (() => void)[] = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          callbacks.push(() => callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver));
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    renderSection();
    expect(callbacks).toHaveLength(TILES.length);
    act(() => callbacks.forEach((reveal) => reveal()));
    expect(screen.queryByText("The state loads when you scroll to it.")).not.toBeInTheDocument();

    // Empty tile: the empty-day box, from its own store.
    expect(await screen.findByRole("heading", { name: "Nothing planned yet" })).toBeInTheDocument();
    // Drag tile: the real lifted card, with the snap label.
    expect(screen.getByText("Dragging · 45m → snaps 15m")).toBeInTheDocument();
    // Reschedule tile: inert picture of the real panel for the board’s example block.
    await waitFor(() => expect(document.querySelector("[inert]")?.textContent).toContain("Reschedule “Client prep”"));
    expect(within(document.querySelector<HTMLElement>("[inert]")!).getAllByRole("menuitem", { hidden: true }).length).toBeGreaterThanOrEqual(4);
    // The overloaded tile’s numbers fall out of its own data.
    expect((await screen.findAllByText("Overloaded · 9h 40m of 8h")).length).toBeGreaterThan(0);
  });
});
