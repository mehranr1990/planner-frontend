import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { componentRows, patternIds, patternMeta, resolvedDecisionIds, supersededRows } from "./rules-data";
import { RulesView } from "./rules-view";

function tierOf(table: HTMLElement, name: string | RegExp) {
  const row = within(table).getByRole("rowheader", { name }).closest("tr")!;
  return row.querySelector("[data-tier]")?.getAttribute("data-tier");
}

describe("RulesView", { timeout: 30_000 }, () => {
  it("is linked from the styleguide nav as the current page", () => {
    renderWithProviders(<RulesView />);
    const nav = screen.getByRole("navigation", { name: "Styleguide pages" });
    expect(within(nav).getByRole("link", { name: "Rules" })).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("defines the four tiers from the three card levels of P00", () => {
    renderWithProviders(<RulesView />);
    const tiers = screen.getByRole("region", { name: "Tiers" });
    for (const quote of [
      "Quiet, compact, simple geometry.",
      "Soft rounded rectangle, no notch, may be scope-tinted.",
      "Exists only where a final board draws it.",
    ]) {
      expect(within(tiers).getByText(quote)).toBeInTheDocument();
    }
    expect(within(tiers).getByText("P00CardsTabs · A · Where in Personal")).toBeInTheDocument();
    expect(within(tiers).getByText("Specialized visualization")).toBeInTheDocument();
  });

  it("classifies the current components, with rings as specialized only", () => {
    renderWithProviders(<RulesView />);
    const table = within(screen.getByRole("region", { name: "Component classification" })).getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(componentRows.length + 1);
    expect(tierOf(table, "SignatureCard · SignatureCardAction")).toBe("signature");
    expect(tierOf(table, "ProductCard")).toBe("product");
    expect(tierOf(table, "UtilityCard · UtilityField")).toBe("utility");
    expect(tierOf(table, "MetricTile · MetricGroup")).toBe("utility");
    expect(tierOf(table, "FolderTabsCard")).toBe("product");
    expect(tierOf(table, "Sheet")).toBe("product");
    expect(tierOf(table, "FloatingPanel")).toBe("product");
    expect(tierOf(table, "Tooltip")).toBe("utility");
    expect(tierOf(table, "ProgressRing")).toBe("specialized");
    expect(tierOf(table, "RingCard")).toBe("specialized");
    expect(within(table).getByText(/^Only the Today ring \(P01 Overview\) and the Habit RingCard/)).toBeInTheDocument();
  });

  it("marks the deprecated notched card and the AI assistant as retiring", () => {
    renderWithProviders(<RulesView />);
    const table = within(screen.getByRole("region", { name: "Component classification" })).getByRole("table");
    const retiring = componentRows.filter((row) => row.retiring).map((row) => row.name);
    expect(retiring).toEqual(["NotchedCard", "AssistantFab · assistant panel"]);
    for (const name of retiring) {
      const row = within(table).getByRole("rowheader", { name: `${name} Retiring` }).closest("tr")!;
      expect(row).toHaveAttribute("data-retiring", "true");
    }
    expect(table.querySelectorAll("[data-retiring]")).toHaveLength(retiring.length);
  });

  it("audits every pattern with allowed, not allowed, scope and final-board evidence", () => {
    renderWithProviders(<RulesView />);
    const patterns = screen.getByRole("region", { name: "Pattern audit" });
    for (const id of patternIds) {
      const article = within(patterns).getAllByRole("article").find((node) => node.querySelector(`#pattern-${id}`));
      expect(article, id).toBeDefined();
      expect(within(article!).getByText("Allowed")).toBeInTheDocument();
      expect(within(article!).getByText("Not allowed")).toBeInTheDocument();
      expect(article!.querySelector("[data-scope-kind]")).toHaveAttribute("data-scope-kind", patternMeta[id].scope);
      // Evidence cites the final package only: never an S-board or a superseded mobile board.
      expect(patternMeta[id].evidence, id).not.toMatch(/\bS\d|\bMobile(Fa)?[A-Z]|Rationale|Main\b/);
    }
    expect(patternMeta.rings.scope).toBe("screenSpecific");
    expect(patternMeta.gauges.scope).toBe("notApproved");
    expect(patternMeta.notches.scope).toBe("signatureOnly");
    expect(within(patterns).getByRole("heading", { name: "Tab families" })).toBeInTheDocument();
  });

  it("states the notch rules: density, one or two actions and never empty, never on rows", () => {
    renderWithProviders(<RulesView />);
    const notches = screen.getByRole("article", { name: "Notches" });
    expect(within(notches).getByText(/At most 3 signature cards per desktop viewport, 1–2 on mobile, only one volt/)).toBeInTheDocument();
    expect(within(notches).getByText(/^Task rows, list and table rows, board cards/)).toBeInTheDocument();
    expect(within(notches).getByText(/A notch must always contain one or two circular contextual action buttons/)).toBeInTheDocument();
    expect(within(notches).getByText(/An empty notch/)).toBeInTheDocument();
  });

  it("lists resolved decisions instead of open questions, and the superseded boards as history", () => {
    renderWithProviders(<RulesView />);
    expect(screen.queryByRole("region", { name: /open questions/i })).not.toBeInTheDocument();
    const resolved = screen.getByRole("region", { name: "Resolved decisions" });
    expect(within(resolved).getAllByRole("listitem")).toHaveLength(resolvedDecisionIds.length);
    expect(within(resolved).getByText(/labelled «نیمه‌تعطیل» in Persian/)).toBeInTheDocument();
    expect(within(resolved).getByText("28px, the top of P00’s 24–28px range.")).toBeInTheDocument();

    const superseded = within(screen.getByRole("region", { name: "Superseded boards" })).getByRole("table");
    expect(within(superseded).getAllByRole("row")).toHaveLength(supersededRows.length + 1);
    expect(within(superseded).getByRole("rowheader", { name: "S1–S3 · S7–S14 (+Dark)" })).toBeInTheDocument();
  });

  it("renders in Persian", () => {
    renderWithProviders(<RulesView />, { preferences: { locale: "fa", direction: "rtl", digits: "fa" } });
    expect(screen.getByRole("heading", { level: 1, name: "قواعد" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "بازبینی الگوها" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "تصمیم‌های قطعی‌شده" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "بُردهای جایگزین‌شده" })).toBeInTheDocument();
    expect(screen.getAllByText("در حال حذف")).toHaveLength(2);
  });
});
