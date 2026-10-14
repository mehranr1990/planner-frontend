import { act, screen } from "@testing-library/react";
import { ArrowUpRight, Play, Square } from "lucide-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notchPresets } from "@/design-system/tokens/radii";
import { renderWithProviders } from "@/test/render";
import { notchPath } from "./notch-path";

import {
  SIGNATURE_DESKTOP_QUERY,
  SignatureCard,
  SignatureCardAction,
  SignatureCardHeader,
  notchMask,
} from "./signature-card";

/** A notch is never empty: cards under test carry one action. */
const ACTION = <SignatureCardAction label="Open" icon={ArrowUpRight} />;

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

/** A controllable matchMedia for the lg breakpoint used by preset="auto". */
function mockViewport(desktop: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches: desktop,
    media: SIGNATURE_DESKTOP_QUERY,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  };
  // Other queries (next-themes' colour scheme) keep the global stub.
  window.matchMedia = vi.fn((media: string) =>
    media === SIGNATURE_DESKTOP_QUERY ? query : originalMatchMedia(media),
  ) as unknown as typeof window.matchMedia;
  return {
    listeners,
    set(next: boolean) {
      act(() => {
        query.matches = next;
        listeners.forEach((listener) => listener());
      });
    },
  };
}

const originalObserver = globalThis.ResizeObserver;
const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  observers.length = 0;
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
});

afterEach(() => {
  globalThis.ResizeObserver = originalObserver;
  window.matchMedia = originalMatchMedia;
});

function surfaceOf(container: HTMLElement) {
  return container.querySelector<HTMLElement>('[data-slot="signature-surface"]')!;
}

const desktop = notchPresets.desktop;
const mobile = notchPresets.mobile;

describe("SignatureCard geometry", () => {
  it("applies the notch path after the ResizeObserver measures the surface", () => {
    const { container } = renderWithProviders(<SignatureCard action={ACTION} preset="desktop">Body</SignatureCard>);
    const surface = surfaceOf(container);
    // Before measuring, the CSS mask carries the shape (no clip-path yet).
    expect(surface.style.clipPath).toBe("");
    expect(surface.dataset.notch).toBeUndefined();

    resize(surface, 400, 240);
    expect(surface.style.clipPath).toBe(`path("${notchPath({ width: 400, height: 240 })}")`);
    expect(surface.dataset.notch).toBe("path");
    expect(surface.className).toContain("rounded-signature");

    resize(surface, 520, 300);
    expect(surface.style.clipPath).toBe(`path("${notchPath({ width: 520, height: 300 })}")`);
  });

  it.each(["desktop", "mobile", "focus"] as const)("exposes the %s preset numbers as CSS variables", (preset) => {
    renderWithProviders(
      <SignatureCard action={ACTION} data-testid="card" preset={preset}>
        x
      </SignatureCard>,
    );
    const root = screen.getByTestId("card");
    const { notchWidth, notchHeight, fillet, button } = notchPresets[preset];
    expect(root.style.getPropertyValue("--notch-w")).toBe(`${notchWidth}px`);
    expect(root.style.getPropertyValue("--notch-h")).toBe(`${notchHeight}px`);
    expect(root.style.getPropertyValue("--notch-button")).toBe(`${button}px`);
    expect(root.style.getPropertyValue("--notch-mask-ltr")).toBe(notchMask("ltr", { notchWidth, notchHeight, fillet }));
    expect(root.style.getPropertyValue("--notch-mask-rtl")).toBe(notchMask("rtl", { notchWidth, notchHeight, fillet }));
    const surface = root.querySelector<HTMLElement>('[data-slot="signature-surface"]')!;
    resize(surface, 360, 220);
    expect(surface.style.clipPath).toBe(`path("${notchPath({ width: 360, height: 220, notchWidth, notchHeight, fillet })}")`);
    expect(surface.dataset.notchPreset).toBe(preset);
  });

  it("auto: ships both breakpoint sets for the first paint, switched by CSS", () => {
    mockViewport(false);
    renderWithProviders(<SignatureCard action={ACTION} data-testid="card">x</SignatureCard>);
    const root = screen.getByTestId("card");
    expect(root.dataset.preset).toBe("auto");
    // No fixed value inline: the breakpoint classes pick the -sm or -lg set.
    expect(root.style.getPropertyValue("--notch-w")).toBe("");
    expect(root.style.getPropertyValue("--notch-sm-w")).toBe(`${mobile.notchWidth}px`);
    expect(root.style.getPropertyValue("--notch-sm-button")).toBe(`${mobile.button}px`);
    expect(root.style.getPropertyValue("--notch-lg-w")).toBe(`${desktop.notchWidth}px`);
    expect(root.style.getPropertyValue("--notch-lg-button")).toBe(`${desktop.button}px`);
    expect(root.style.getPropertyValue("--notch-sm-mask-rtl")).toBe(notchMask("rtl", mobile));
    expect(root.style.getPropertyValue("--notch-lg-mask-ltr")).toBe(notchMask("ltr", desktop));
    for (const token of [
      "[--notch-w:var(--notch-sm-w)]",
      "lg:[--notch-w:var(--notch-lg-w)]",
      "[--notch-mask-ltr:var(--notch-sm-mask-ltr)]",
      "lg:[--notch-mask-rtl:var(--notch-lg-mask-rtl)]",
      "lg:[--notch-button:var(--notch-lg-button)]",
    ]) {
      expect(root.className).toContain(token);
    }
  });

  it("auto: re-applies the clip path when the lg breakpoint changes", () => {
    const viewport = mockViewport(false);
    const { container, unmount } = renderWithProviders(<SignatureCard action={ACTION}>x</SignatureCard>);
    const surface = surfaceOf(container);
    resize(surface, 400, 240);
    expect(surface.dataset.notchPreset).toBe("mobile");
    expect(surface.style.clipPath).toBe(`path("${notchPath({ width: 400, height: 240, ...mobile })}")`);

    viewport.set(true);
    expect(surface.dataset.notchPreset).toBe("desktop");
    expect(surface.style.clipPath).toBe(`path("${notchPath({ width: 400, height: 240, ...desktop })}")`);

    unmount();
    expect(viewport.listeners.size).toBe(0);
  });

  it("mirrors the path from the element's computed direction, including nested dir", () => {
    const { container } = renderWithProviders(
      <div dir="rtl">
        <SignatureCard action={ACTION} preset="desktop">RTL</SignatureCard>
        <div dir="ltr">
          <SignatureCard action={ACTION} preset="desktop">LTR island</SignatureCard>
        </div>
      </div>,
    );
    const [rtl, ltr] = Array.from(container.querySelectorAll<HTMLElement>('[data-slot="signature-surface"]'));
    resize(rtl!, 400, 240);
    resize(ltr!, 400, 240);
    expect(rtl!.style.clipPath).toBe(`path("${notchPath({ width: 400, height: 240, direction: "rtl" })}")`);
    expect(rtl!.dataset.notchCorner).toBe("top-left");
    expect(ltr!.dataset.notchCorner).toBe("top-right");
    expect(rtl!.className).toContain("rtl:[mask:var(--notch-mask-rtl)]");
  });

  it("re-applies the path when a dir attribute changes", async () => {
    const { container } = renderWithProviders(
      <div data-testid="host" dir="ltr">
        <SignatureCard action={ACTION} preset="desktop">Body</SignatureCard>
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
    expect(surface.dataset.notchCorner).toBe("top-left");
  });

  it('side="start" mirrors the other way: top-left in LTR, top-right in RTL', () => {
    const { container } = renderWithProviders(
      <>
        <SignatureCard action={ACTION} data-testid="ltr" preset="desktop" side="start">
          a
        </SignatureCard>
        <div dir="rtl">
          <SignatureCard data-testid="rtl" preset="desktop" side="start" action={<SignatureCardAction label="Open" icon={ArrowUpRight} />}>
            b
          </SignatureCard>
        </div>
      </>,
    );
    const ltr = surfaceOf(screen.getByTestId("ltr"));
    const rtl = surfaceOf(screen.getByTestId("rtl"));
    resize(ltr, 400, 240);
    resize(rtl, 400, 240);
    expect(ltr.style.clipPath).toBe(`path("${notchPath({ width: 400, height: 240, direction: "rtl" })}")`);
    expect(ltr.dataset.notchCorner).toBe("top-left");
    expect(rtl.style.clipPath).toBe(`path("${notchPath({ width: 400, height: 240, direction: "ltr" })}")`);
    expect(rtl.dataset.notchCorner).toBe("top-right");
    // The first-paint masks are swapped too.
    expect(screen.getByTestId("ltr").style.getPropertyValue("--notch-mask-ltr")).toBe(notchMask("rtl", desktop));
    // The action and the header reservation move to the start side.
    const slot = container.querySelector('[data-slot="notch-action"]')!;
    expect(slot.className).toContain("start-0");
    expect(slot.className).not.toContain("end-0");
    expect(rtl.className).toContain("[--notch-reserve-start:calc(var(--notch-w)-var(--notch-pad)+0.5rem)]");
  });
});

describe("SignatureCard notch content", () => {
  it("renders one action outside the clipped surface, at the inline-end corner", () => {
    const { container } = renderWithProviders(
      <SignatureCard as="article" aria-label="Lead" action={<SignatureCardAction label="Open lead" icon={ArrowUpRight} mirror variant="neutral" />}>
        <SignatureCardHeader>Jane Doe</SignatureCardHeader>
      </SignatureCard>,
    );
    const button = screen.getByRole("button", { name: "Open lead" });
    const article = screen.getByRole("article", { name: "Lead" });
    expect(surfaceOf(container)).not.toContainElement(button);
    expect(article).toContainElement(button);
    expect(article).toHaveAttribute("data-notch-actions", "1");
    const slot = container.querySelector('[data-slot="notch-action"]')!;
    expect(slot.className).toContain("end-0");
    expect(slot.className).toContain("top-0");
    expect(button.className).toContain("size-(--notch-button)");
    // 46px mobile circle + 4px each side keeps the 48px hit area.
    expect(button.className).toContain("after:-inset-1");
    expect(button.className).toContain("bg-canvas");
    expect(button.className).not.toContain("bg-secondary ");
  });

  it("takes the double notch for two related actions: 112×60 / f28, two 48px circles", () => {
    const { container } = renderWithProviders(
      <SignatureCard
        data-testid="insight"
        tone="deep"
        action={[
          <SignatureCardAction key="open" variant="neutral" label="See pattern" icon={ArrowUpRight} />,
          <SignatureCardAction key="stop" variant="danger" label="Stop showing this insight" icon={Square} />,
        ]}
      >
        Insight
      </SignatureCard>,
    );
    const card = screen.getByTestId("insight");
    expect(card).toHaveAttribute("data-notch-actions", "2");
    expect(card).toHaveAttribute("data-preset", "double");
    expect(card.style.getPropertyValue("--notch-w")).toBe("112px");
    expect(card.style.getPropertyValue("--notch-h")).toBe("60px");
    expect(card.style.getPropertyValue("--notch-button")).toBe("48px");
    const slot = container.querySelector('[data-slot="notch-action"]')!;
    expect(slot.querySelectorAll("button")).toHaveLength(2);
    // Stop is the destructive (red) action; both stay circles sized by the notch.
    const stop = screen.getByRole("button", { name: "Stop showing this insight" });
    expect(stop.className).toContain("bg-destructive");
    expect(stop.className).toContain("size-(--notch-button)");
    expect(notchPresets.double).toEqual({ notchWidth: 112, notchHeight: 60, fillet: 28, button: 48 });
  });

  it("warns when more than one action is passed", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    renderWithProviders(
      <SignatureCard
        action={
          <>
            <SignatureCardAction label="One" icon={Play} />
            <SignatureCardAction label="Two" icon={Play} />
          </>
        }
      >
        x
      </SignatureCard>,
    );
    expect(error).toHaveBeenCalledWith(expect.stringContaining("one or two actions"));
    error.mockRestore();
  });

  it("primary action: scope-deep fill, and the glyph can take volt on a volt card", () => {
    renderWithProviders(
      <SignatureCard tone="volt" action={<SignatureCardAction label="Start focus" icon={Play} iconClassName="fill-volt text-volt" />}>
        Now
      </SignatureCard>,
    );
    const button = screen.getByRole("button", { name: "Start focus" });
    expect(button.className).toContain("bg-primary");
    expect(button.className).toContain("text-on-accent");
    expect(button.querySelector("svg")!.getAttribute("class")).toContain("fill-volt");
  });

  it("header reserves the notch on the notch side", () => {
    renderWithProviders(
      <SignatureCard action={ACTION} preset="desktop">
        <SignatureCardHeader data-testid="header">Title</SignatureCardHeader>
      </SignatureCard>,
    );
    const header = screen.getByTestId("header");
    expect(header.className).toContain("pe-(--notch-reserve-end)");
    expect(header.className).toContain("ps-(--notch-reserve-start)");
    expect(header.className).toContain("min-h-[calc(var(--notch-h)-var(--notch-pad))]");
  });
});

describe("SignatureCard tones and padding", () => {
  it.each([
    ["surface", "bg-surface", "text-fg"],
    ["deep", "bg-deep-card", "text-on-deep-card"],
    ["volt", "bg-volt", "text-on-volt"],
    ["scope-soft", "bg-scope-soft", "text-fg"],
  ] as const)("tone %s paints %s", (tone, background, text) => {
    const { container } = renderWithProviders(<SignatureCard action={ACTION} tone={tone}>x</SignatureCard>);
    const surface = surfaceOf(container);
    expect(surface.className).toContain(background);
    expect(surface.className).toContain(text);
  });

  it("deep tone uses the deep-card token, never scope-deep (bright mint in dark)", () => {
    // The class is theme-independent: --deep-card resolves to #173A31 in dark (design-extensions.css).
    const { container } = renderWithProviders(
      <div className="dark">
        <SignatureCard action={ACTION} tone="deep">x</SignatureCard>
      </div>,
    );
    const surface = surfaceOf(container);
    expect(surface.className).toContain("bg-deep-card");
    expect(surface.className).not.toMatch(/scope-deep/);
  });

  it("defaults to the board's 22px padding with a compact option", () => {
    const { container } = renderWithProviders(
      <>
        <SignatureCard action={ACTION}>a</SignatureCard>
        <SignatureCard action={ACTION} padding="compact">b</SignatureCard>
      </>,
    );
    const [standard, compact] = Array.from(container.querySelectorAll<HTMLElement>('[data-slot="signature-surface"]'));
    expect(standard!.className).toContain("p-5.5");
    expect(standard!.className).toContain("[--notch-pad:1.375rem]");
    expect(compact!.className).toContain("p-4.5");
  });

  it("keeps the rounded-rectangle fallback while too small to notch", () => {
    const { container } = renderWithProviders(<SignatureCard action={ACTION} preset="desktop">x</SignatureCard>);
    const surface = surfaceOf(container);
    resize(surface, 100, 100);
    expect(surface.style.clipPath).toBe(`path("${notchPath({ width: 100, height: 100 })}")`);
  });

  it("builds a mirrored CSS mask for the first paint", () => {
    const shape = { notchWidth: 64, notchHeight: 64, fillet: 28 };
    const ltr = notchMask("ltr", shape);
    const rtl = notchMask("rtl", shape);
    expect(ltr).toContain("right 64px top 0 / 28px 28px");
    expect(ltr).toContain("circle at 0 100%");
    expect(rtl).toContain("left 64px top 0 / 28px 28px");
    expect(rtl).toContain("circle at 100% 100%");
    expect(rtl).not.toContain("right 64px");
  });
});
