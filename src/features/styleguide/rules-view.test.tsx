import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { componentRows, openQuestionIds, patternIds, patternMeta } from "./rules-data";
import { RulesView } from "./rules-view";

describe("RulesView", { timeout: 30_000 }, () => {
  it("is linked from the styleguide nav as the current page", () => {
    renderWithProviders(<RulesView />);
    const nav = screen.getByRole("navigation", { name: "Styleguide pages" });
    expect(within(nav).getByRole("link", { name: "Rules" })).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("defines the four tiers, quoting the Rationale board", () => {
    renderWithProviders(<RulesView />);
    const tiers = screen.getByRole("region", { name: "Tiers" });
    for (const quote of [
      "Flat, compact, dense. Forms, tables, filters.",
      "Plain sculpted card, scope tint as cue.",
      "Notch, accent, motion. One or two per screen.",
    ]) {
      expect(within(tiers).getByText(quote)).toBeInTheDocument();
    }
    expect(within(tiers).getByText("Specialized visualization")).toBeInTheDocument();
  });

  it("classifies every component, with rings as specialized only", () => {
    renderWithProviders(<RulesView />);
    const table = within(screen.getByRole("region", { name: "Component classification" })).getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(componentRows.length + 1);
    const ring = within(table).getByRole("rowheader", { name: "ProgressRing" }).closest("tr")!;
    expect(ring.querySelector("[data-tier]")).toHaveAttribute("data-tier", "specialized");
    const notched = within(table).getByRole("rowheader", { name: "NotchedCard" }).closest("tr")!;
    expect(notched.querySelector("[data-tier]")).toHaveAttribute("data-tier", "signature");
  });

  it("audits every requested pattern with allowed, not allowed and scope", () => {
    renderWithProviders(<RulesView />);
    const patterns = screen.getByRole("region", { name: "Pattern audit" });
    for (const id of patternIds) {
      const article = within(patterns).getAllByRole("article").find((node) => node.querySelector(`#pattern-${id}`));
      expect(article, id).toBeDefined();
      expect(within(article!).getByText("Allowed")).toBeInTheDocument();
      expect(within(article!).getByText("Not allowed")).toBeInTheDocument();
      expect(article!.querySelector("[data-scope-kind]")).toHaveAttribute("data-scope-kind", patternMeta[id].scope);
    }
    expect(patternMeta.rings.scope).toBe("screenSpecific");
    expect(patternMeta.gauges.scope).toBe("notApproved");
    expect(patternMeta.notches.scope).toBe("signatureOnly");
  });

  it("lists contradictions in the design package as open questions, not rules", () => {
    renderWithProviders(<RulesView />);
    const open = screen.getByRole("region", { name: "Open questions in the design package" });
    expect(within(open).getAllByRole("listitem")).toHaveLength(openQuestionIds.length);
  });

  it("renders in Persian", () => {
    renderWithProviders(<RulesView />, { preferences: { locale: "fa", direction: "rtl", digits: "fa" } });
    expect(screen.getByRole("heading", { level: 1, name: "قواعد" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "بازبینی الگوها" })).toBeInTheDocument();
  });
});
