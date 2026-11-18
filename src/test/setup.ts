import "@testing-library/jest-dom/vitest";
import { cleanup, configure, screen, waitFor } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// findBy*/waitFor poll up to 1s by default: too tight for Radix-heavy renders when the machine is busy.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.cookie = "mp-preferences=; Max-Age=0; Path=/";
  document.cookie = "mp-planner=; Max-Age=0; Path=/";
});

/**
 * A toast's action button once it can be clicked. Radix's toast viewport keeps an inline
 * `pointer-events: none` until it has registered the toast; under full-suite load a click
 * can land in that window. Waits for it instead of turning off user-event's check.
 */
export async function findToastAction(name: string) {
  const button = await screen.findByRole("button", { name });
  await waitFor(() => {
    for (let node: HTMLElement | null = button; node; node = node.parentElement)
      if (node.style.pointerEvents === "none") throw new Error("toast viewport not interactive yet");
  });
  return button;
}

// The App Router is not mounted in unit tests; preference actions call refresh().
export const routerRefresh = vi.fn();
export const routerPush = vi.fn();
export const routerReplace = vi.fn();
let mockPathname = "/";
let mockSearch = "";

/** Sets what usePathname() returns in the current test (reset after each test). */
let mockParams: Record<string, string> = {};

/** Dynamic route params for components that call useParams (Social routes). */
export function setMockParams(params: Record<string, string>) {
  mockParams = params;
}

export function setMockPathname(pathname: string) {
  mockPathname = pathname;
}

/** Sets what useSearchParams() returns, e.g. "sheet=quick-add" (reset after each test). */
export function setMockSearch(search: string) {
  mockSearch = search;
}

afterEach(() => {
  mockPathname = "/";
  mockSearch = "";
  routerRefresh.mockClear();
  routerPush.mockClear();
  routerReplace.mockClear();
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh, push: routerPush, replace: routerReplace, prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(mockSearch),
  useParams: () => mockParams,
}));

// jsdom lacks these browser APIs; next-themes, Radix and Motion expect them.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

// Radix Toast swipe handling uses pointer capture, which jsdom lacks.
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => undefined;
Element.prototype.releasePointerCapture ??= () => undefined;

// jsdom has no layout: scrolling is a no-op (it logs "not implemented" otherwise).
window.scrollBy = () => undefined;
Element.prototype.scrollBy = () => undefined;
