import { act, screen } from "@testing-library/react";
import { ArrowUpRight, Bell } from "lucide-react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Icon } from "@/components/ui/icon";
import { notchPresets } from "@/design-system/tokens/radii";
import { renderWithProviders } from "@/test/render";
import { NotchedCard, NotchedCardButton, NotchedCardHeader, notchMask } from "./notched-card";
import { notchPath } from "./notch-path";

type Callback = (entries: Array<Partial<ResizeObserverEntry>>) => void;

const observers: Array<{ callback: Callback; targets: Element[] }> = [];

class MockResizeObserver {
  private record: { callback: Callback; targets: Element[] };
  constructor(callback: Callback) {
    this.record = { callback, targets: [] };
    observers.push(this.record);
  }
  observe(target: Element) {
    this.record.targets.push(target);
  }
  unobserve() {}
  disconnect() {}
}

function resize(target: Element, width: number, height: number) {
  act(() => {
    for (const observer of observers) {
      if (!observer.targets.includes(target)) continue;
      observer.callback([
        { target, borderBoxSize: [{ inlineSize: width, blockSize: height }] as unknown as ResizeObserverSize[] },
      ]);
    }
  });
}

const original = globalThis.ResizeObserver;

beforeEach(() => {
  observers.length = 0;
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
});

afterEach(() => {
  globalThis.ResizeObserver = original;
});

function surfaceOf(container: HTMLElement) {
  return container.querySelector<HTMLElement>('[data-slot="notched-surface"]')!;
}

describe("NotchedCard", () => {
  it("applies the notch path after the ResizeObserver measures the surface", () => {
    const { container } = renderWithProviders(<NotchedCard>Body</NotchedCard>);
    const surface = surfaceOf(container);
    // Before measuring, the CSS mask carries the shape (no clip-path yet).
    expect(surface.style.clipPath).toBe("");
    expect(surface.dataset.notch).toBeUndefined();

    resize(surface, 400, 240);
    expect(surface.style.clipPath).toBe(`path("${notchPath({ width: 400, height: 240 })}")`);
    expect(surface.dataset.notch).toBe("path");

    resize(surface, 520, 300);
    expect(surface.style.clipPath).toBe(`path("${notchPath({ width: 520, height: 300 })}")`);
  });

  it("mirrors the path from the element's computed direction, including nested dir", () => {
    const { container } = renderWithProviders(
      <div dir="rtl">
        <NotchedCard>RTL</NotchedCard>
        <div dir="ltr">
          <NotchedCard>LTR island</NotchedCard>
        </div>
      </div>,
    );
    const [rtl, ltr] = Array.from(container.querySelectorAll<HTMLElement>('[data-slot="notched-surface"]'));
    resize(rtl!, 400, 240);
    resize(ltr!, 400, 240);
    expect(rtl!.style.clipPath).toBe(`path("${notchPath({ width: 400, height: 240, direction: "rtl" })}")`);
    expect(rtl!.dataset.notchDirection).toBe("rtl");
    expect(ltr!.dataset.notchDirection).toBe("ltr");
  });

  it("re-applies the path when a dir attribute changes", async () => {
    const { container } = renderWithProviders(
      <div data-testid="host" dir="ltr">
        <NotchedCard>Body</NotchedCard>
      </div>,
    );
    const surface = surfaceOf(container);
    resize(surface, 400, 240);
    expect(surface.dataset.notchDirection).toBe("ltr");
    await act(async () => {
      screen.getByTestId("host").setAttribute("dir", "rtl");
      await Promise.resolve();
    });
    expect(surface.dataset.notchDirection).toBe("rtl");
  });

  it("renders the action outside the clipped surface, at the inline-end corner", () => {
    const { container } = renderWithProviders(
      <NotchedCard
        as="article"
        aria-label="Lead"
        action={
          <NotchedCardButton aria-label="Open lead">
            <Icon icon={ArrowUpRight} mirror />
          </NotchedCardButton>
        }
      >
        <NotchedCardHeader>Jane Doe</NotchedCardHeader>
      </NotchedCard>,
    );
    const button = screen.getByRole("button", { name: "Open lead" });
    const surface = surfaceOf(container);
    expect(surface).not.toContainElement(button);
    expect(screen.getByRole("article", { name: "Lead" })).toContainElement(button);
    const slot = container.querySelector('[data-slot="notch-action"]')!;
    expect(slot.className).toContain("end-0");
    expect(slot.className).toContain("top-0");
    expect(button.className).toContain("size-(--notch-button)");
  });

  it("sizes the notch and buttons per preset", () => {
    const { container } = renderWithProviders(
      <>
        <NotchedCard data-testid="default">a</NotchedCard>
        <NotchedCard data-testid="compact" preset="compact">
          b
        </NotchedCard>
        <NotchedCard
          data-testid="double"
          preset="double"
          tone="volt"
          action={
            <>
              <NotchedCardButton aria-label="Reminder">
                <Icon icon={Bell} />
              </NotchedCardButton>
              <NotchedCardButton aria-label="Open task">
                <Icon icon={ArrowUpRight} mirror />
              </NotchedCardButton>
            </>
          }
        >
          c
        </NotchedCard>
      </>,
    );
    for (const preset of ["default", "compact", "double"] as const) {
      const root = screen.getByTestId(preset);
      const { notchWidth, notchHeight, button, fillet } = notchPresets[preset];
      expect(root.style.getPropertyValue("--notch-w")).toBe(`${notchWidth}px`);
      expect(root.style.getPropertyValue("--notch-h")).toBe(`${notchHeight}px`);
      expect(root.style.getPropertyValue("--notch-button")).toBe(`${button}px`);
      const surface = root.querySelector<HTMLElement>('[data-slot="notched-surface"]')!;
      resize(surface, 360, 220);
      expect(surface.style.clipPath).toBe(
        `path("${notchPath({ width: 360, height: 220, notchWidth, notchHeight, fillet })}")`,
      );
    }
    expect(surfaceOf(screen.getByTestId("double")).className).toContain("bg-volt");
    expect(container.querySelectorAll('[data-slot="notch-action"] button')).toHaveLength(2);
  });

  it("builds a mirrored CSS mask for the first paint", () => {
    const shape = { notchWidth: 64, notchHeight: 64, fillet: 30 };
    const ltr = notchMask("ltr", shape);
    const rtl = notchMask("rtl", shape);
    expect(ltr).toContain("right 64px top 0 / 30px 30px");
    expect(ltr).toContain("circle at 0 100%");
    expect(rtl).toContain("left 64px top 0 / 30px 30px");
    expect(rtl).toContain("circle at 100% 100%");
    expect(rtl).not.toContain("right 64px");
  });

  it("keeps the rounded-rectangle fallback while too small to notch", () => {
    const { container } = renderWithProviders(<NotchedCard>x</NotchedCard>);
    const surface = surfaceOf(container);
    resize(surface, 100, 100);
    expect(surface.style.clipPath).toBe(`path("${notchPath({ width: 100, height: 100 })}")`);
  });
});
