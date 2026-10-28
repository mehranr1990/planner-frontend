import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useIsDesktop } from "./use-is-desktop";

/* The lg query behind the popover/sheet, drag-side and timeline-scale switches. */

const realMatchMedia = window.matchMedia;
afterEach(() => {
  window.matchMedia = realMatchMedia;
});

function stubMatchMedia(matches: boolean) {
  const listeners = new Set<() => void>();
  const state = { matches };
  window.matchMedia = vi.fn((query: string) => ({
    get matches() {
      return state.matches;
    },
    media: query,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  })) as unknown as typeof window.matchMedia;
  return {
    set(value: boolean) {
      state.matches = value;
      listeners.forEach((listener) => listener());
    },
  };
}

describe("useIsDesktop", () => {
  it("asks for the lg query and follows it as the viewport crosses the breakpoint", () => {
    const media = stubMatchMedia(false);
    const { result } = renderHook(() => useIsDesktop());
    expect(window.matchMedia).toHaveBeenCalledWith("(min-width: 64rem)");
    expect(result.current).toBe(false);
    act(() => media.set(true));
    expect(result.current).toBe(true);
    act(() => media.set(false));
    expect(result.current).toBe(false);
  });

  it("is mobile when the browser has no matchMedia", () => {
    // @ts-expect-error simulating an engine without matchMedia
    window.matchMedia = undefined;
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(false);
  });
});
