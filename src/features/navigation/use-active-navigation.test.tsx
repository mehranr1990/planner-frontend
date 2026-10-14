import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { setMockPathname } from "@/test/setup";
import { useActiveContext, useActiveNavItem } from "./use-active-navigation";

describe("useActiveContext / useActiveNavItem", () => {
  it("reads the context and item from the pathname", () => {
    setMockPathname("/projects/board/");
    expect(renderHook(() => useActiveContext()).result.current?.id).toBe("project");
    expect(renderHook(() => useActiveNavItem()).result.current?.id).toBe("board");
  });

  it("returns undefined outside every context", () => {
    setMockPathname("/");
    expect(renderHook(() => useActiveContext()).result.current).toBeUndefined();
    expect(renderHook(() => useActiveNavItem()).result.current).toBeUndefined();
  });
});
