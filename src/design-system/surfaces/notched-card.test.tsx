import { screen } from "@testing-library/react";
import { X } from "lucide-react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { NotchedCard, NotchedCardButton, NotchedCardHeader } from "./notched-card";
import { SignatureCardHeader } from "./signature-card";

/* The deprecated NotchedCard shim maps the retired props onto SignatureCard. */
describe("NotchedCard (deprecated shim)", () => {
  it("renders a SignatureCard and maps the legacy tone and padding", () => {
    const { container } = renderWithProviders(
      <NotchedCard
        data-testid="card"
        preset="mobile"
        radius="card-sm"
        tone="elevated"
        padding="lg"
        action={<NotchedCardButton icon={X} label="Close" variant="secondary" />}
      >
        <NotchedCardHeader>Title</NotchedCardHeader>
      </NotchedCard>,
    );
    const surface = container.querySelector<HTMLElement>('[data-slot="signature-surface"]')!;
    expect(surface.className).toContain("bg-elevated");
    expect(surface.className).not.toContain("bg-surface");
    expect(surface.className).toContain("rounded-signature");
    expect(surface.className).toContain("p-5.5");
    expect(screen.getByTestId("card").style.getPropertyValue("--notch-button")).toBe("46px");
    expect(screen.getByRole("button", { name: "Close" }).className).toContain("size-(--notch-button)");
  });

  it("maps scope-deep to the deep card tone", () => {
    const { container } = renderWithProviders(
      <NotchedCard tone="scope-deep" action={<NotchedCardButton label="Open" />}>
        x
      </NotchedCard>,
    );
    const surface = container.querySelector<HTMLElement>('[data-slot="signature-surface"]')!;
    expect(surface.className).toContain("bg-deep-card");
    expect(surface.className).not.toContain("scope-deep");
  });

  it("re-exports the header", () => {
    expect(NotchedCardHeader).toBe(SignatureCardHeader);
  });
});
