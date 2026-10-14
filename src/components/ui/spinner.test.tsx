import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Spinner } from "./spinner";

describe("Spinner", () => {
  it("is decorative by default", () => {
    const { container } = render(<Spinner />);
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("announces a label when standalone", () => {
    render(<Spinner label="Loading…" size="lg" />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Loading…");
    expect(status.querySelector("[aria-hidden]")).toHaveClass("size-6", "animate-spin");
  });
});
