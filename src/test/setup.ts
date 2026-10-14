import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.cookie = "mp-preferences=; Max-Age=0; Path=/";
});

// The App Router is not mounted in unit tests; preference actions call refresh().
export const routerRefresh = vi.fn();
export const routerPush = vi.fn();
let mockPathname = "/";

/** Sets what usePathname() returns in the current test (reset after each test). */
export function setMockPathname(pathname: string) {
  mockPathname = pathname;
}

afterEach(() => {
  mockPathname = "/";
  routerRefresh.mockClear();
  routerPush.mockClear();
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh, push: routerPush, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(),
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
