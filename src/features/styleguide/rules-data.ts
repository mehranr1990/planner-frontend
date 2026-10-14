import type { Tier } from "./tier-badge";

/*
 * Design-system classification and pattern rules of the FINAL Personal
 * package: CLAUDE.md §2 (non-negotiable rules 1–9), PERSONAL.md "P00 · Card
 * Geometry & Tab Families" (Rules, Where in Personal, Tab families) and P99
 * (Reusable components, UX audit, Superseded boards). Evidence cites final
 * boards only (P00*, P01–P18, PM01–PM04, DataViz*); the S-boards and
 * Mobile* boards are history.
 * Text lives in Styleguide.rulesPage; this file holds the structure only.
 * Rule of the page: document approved, reusable patterns — never extrapolate
 * a product-wide rule from a single screen.
 */

export interface ComponentRow {
  /** Code name, shown as-is (LTR). */
  name: string;
  tier: Tier;
  /** Optional Styleguide.rulesPage.componentNotes key. */
  note?: ComponentNote;
  /** Still in the code but being removed; never use it in new work. */
  retiring?: boolean;
}

export type ComponentNote =
  | "signatureCard"
  | "productCard"
  | "utilityCard"
  | "metricTile"
  | "folderTabs"
  | "progressRing"
  | "ringCard"
  | "progress"
  | "segmentedProgress"
  | "segmented"
  | "tabs"
  | "tooltip"
  | "sheet"
  | "floatingPanel"
  | "dialog"
  | "toast"
  | "statusChip"
  | "switcher"
  | "schedule"
  | "mobileNav"
  | "rail"
  | "notchedCard"
  | "assistant";

export const componentRows: readonly ComponentRow[] = [
  { name: "Button · IconButton", tier: "utility" },
  { name: "Field · Input · Textarea", tier: "utility" },
  { name: "Select", tier: "utility" },
  { name: "Checkbox · RadioGroup · Switch", tier: "utility" },
  { name: "Slider", tier: "utility" },
  { name: "Chip · ToggleChip · RemovableChip", tier: "utility" },
  { name: "SearchField", tier: "utility" },
  { name: "FormErrorSummary", tier: "utility" },
  { name: "Calendar · DatePicker", tier: "utility" },
  { name: "UtilityCard · UtilityField", tier: "utility", note: "utilityCard" },
  { name: "MetricTile · MetricGroup", tier: "utility", note: "metricTile" },
  { name: "StatusChip", tier: "utility", note: "statusChip" },
  { name: "Progress", tier: "utility", note: "progress" },
  { name: "SegmentedProgress", tier: "utility", note: "segmentedProgress" },
  { name: "Segmented", tier: "utility", note: "segmented" },
  { name: "Tabs · PillGroup", tier: "utility", note: "tabs" },
  { name: "Tooltip", tier: "utility", note: "tooltip" },
  { name: "Dialog · ConfirmDialog · AlertDialog", tier: "utility", note: "dialog" },
  { name: "DropdownMenu · Popover", tier: "utility" },
  { name: "Toast · InlineAlert", tier: "utility", note: "toast" },
  { name: "Empty · Error · Loading · NoResults · Unavailable", tier: "utility" },
  { name: "Skeleton · Spinner", tier: "utility" },
  { name: "Avatar · AvatarGroup · Badge", tier: "utility" },
  { name: "FloatingRail", tier: "utility", note: "rail" },
  { name: "Breadcrumbs · PageHeader · ContextNavList", tier: "utility" },
  { name: "ContextChips", tier: "utility" },
  { name: "ProductCard", tier: "product", note: "productCard" },
  { name: "FolderTabsCard", tier: "product", note: "folderTabs" },
  { name: "Sheet", tier: "product", note: "sheet" },
  { name: "FloatingPanel", tier: "product", note: "floatingPanel" },
  { name: "SignatureCard · SignatureCardAction", tier: "signature", note: "signatureCard" },
  { name: "ContextSwitcher", tier: "signature", note: "switcher" },
  { name: "ScheduleIsland", tier: "signature", note: "schedule" },
  { name: "MobileBottomNav", tier: "signature", note: "mobileNav" },
  { name: "ProgressRing", tier: "specialized", note: "progressRing" },
  { name: "RingCard", tier: "specialized", note: "ringCard" },
  { name: "NotchedCard", tier: "signature", note: "notchedCard", retiring: true },
  { name: "AssistantFab · assistant panel", tier: "signature", note: "assistant", retiring: true },
];

export const patternIds = [
  "progress",
  "rings",
  "gauges",
  "dataViz",
  "cardGeometry",
  "notches",
  "tabs",
  "folderTabs",
  "volt",
  "surfaces",
  "status",
  "scopeColours",
  "containers",
] as const;

export type PatternId = (typeof patternIds)[number];

export type PatternScope = "universal" | "screenSpecific" | "signatureOnly" | "notApproved";

/** Whether each pattern is universal or bound to specific screens, and its evidence in the final package. */
export const patternMeta: Record<PatternId, { scope: PatternScope; evidence: string }> = {
  progress: {
    scope: "universal",
    evidence: "CLAUDE.md §2.6 · P00CardsTabs · P99 UX audit · P01 · P11 · P13 · P16 · PM01",
  },
  rings: { scope: "screenSpecific", evidence: "CLAUDE.md §2.6 · P99 UX audit · P00CardsTabs D′ · P01 · P12" },
  gauges: { scope: "notApproved", evidence: "CLAUDE.md §2.6 · P99 UX audit" },
  dataViz: {
    scope: "screenSpecific",
    evidence: "DataVizPersonal · DataVizRefine · DataVizAdd · HabitStreakRibbon · P10 · P11–P16 · PM04",
  },
  cardGeometry: { scope: "universal", evidence: "CLAUDE.md §2.4 · P00CardsTabs · P99 Reusable components · P18" },
  notches: {
    scope: "signatureOnly",
    evidence: "CLAUDE.md §2.4, §4 · P00CardsTabs (Rules · Where in Personal) · P01 · P06 · PM01 · PM04",
  },
  tabs: { scope: "universal", evidence: "CLAUDE.md §2.5 · P00CardsTabs (Tab families) · P99 UX audit · P04 · P09 · P17" },
  folderTabs: {
    scope: "universal",
    evidence: "CLAUDE.md §4 · P00CardsTabs D · D′ · P06 · P11 · P12 · P13 · P14 · P15 · PM04",
  },
  volt: { scope: "universal", evidence: "CLAUDE.md §2.3 · P01 · P06 · P09 · P99 UX audit" },
  surfaces: { scope: "universal", evidence: "CLAUDE.md §2.1, §2.7 · P00CardsTabsDark · P99 UX audit · P01–P18 Dark" },
  status: { scope: "universal", evidence: "CLAUDE.md §2.8 · P00CardsTabs · P03TasksList · P07 · PM04" },
  scopeColours: { scope: "universal", evidence: "CLAUDE.md §2.1–2.2 · P00CardsTabs · P04 · DataVizPersonal" },
  containers: { scope: "universal", evidence: "CLAUDE.md §5 · P18 (Rules) · P06 · PM01 · PM02" },
};

/** Decisions the package left open or contradictory, now resolved by the product owner. */
export const resolvedDecisionIds = [
  "notchSize",
  "retiredPresets",
  "productRadius",
  "lightDeepCard",
  "dataVizColours",
  "screenshotWins",
  "compactPills",
  "thursday",
  "persianDefault",
] as const;

export type SupersededId = "personal" | "mobile" | "mobileFa" | "dataViz" | "laterPhases";

/** Boards kept for history only (P99 · Superseded boards). Board names are shown as-is (LTR). */
export const supersededRows: readonly { id: SupersededId; old: string; final: string }[] = [
  { id: "personal", old: "S1–S3 · S7–S14 (+Dark)", final: "P01–P16" },
  { id: "mobile", old: "MobileHome · MobileTasks", final: "PM01MobileCore" },
  { id: "mobileFa", old: "MobileFaHome · MobileFaTasks · MobileFaQuickAdd · MobileFaCalendar (+Dark)", final: "PM04MobileFa" },
  { id: "dataViz", old: "DataVizPersonal §03 · §04 · §08 v1", final: "DataVizRefine v2 · DataVizAdd" },
  { id: "laterPhases", old: "S4–S6", final: "—" },
];
