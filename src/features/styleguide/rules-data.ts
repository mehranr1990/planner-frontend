import type { Tier } from "./tier-badge";

/*
 * Design-system classification and pattern audit, compiled from every board
 * in design/ (screenshots + board scripts) and CLAUDE.md.
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
}

export type ComponentNote =
  | "notchedCard"
  | "productCard"
  | "folderTabs"
  | "progressRing"
  | "ringCard"
  | "progress"
  | "segmentedProgress"
  | "segmented"
  | "tabs"
  | "statusChip"
  | "switcher"
  | "schedule"
  | "mobileNav"
  | "assistant"
  | "rail";

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
  { name: "Dialog · ConfirmDialog · Sheet", tier: "utility" },
  { name: "DropdownMenu · Popover · Tooltip", tier: "utility" },
  { name: "Toast · InlineAlert", tier: "utility" },
  { name: "Empty · Error · Loading · NoResults · Unavailable", tier: "utility" },
  { name: "Skeleton · Spinner", tier: "utility" },
  { name: "Avatar · AvatarGroup · Badge", tier: "utility" },
  { name: "StatusChip", tier: "utility", note: "statusChip" },
  { name: "Progress", tier: "utility", note: "progress" },
  { name: "SegmentedProgress", tier: "utility", note: "segmentedProgress" },
  { name: "Segmented", tier: "utility", note: "segmented" },
  { name: "Tabs", tier: "utility", note: "tabs" },
  { name: "FloatingRail", tier: "utility", note: "rail" },
  { name: "Breadcrumbs · PageHeader · ContextNavList", tier: "utility" },
  { name: "ContextChips", tier: "utility" },
  { name: "Surface (product card)", tier: "product", note: "productCard" },
  { name: "FolderTabsCard", tier: "product", note: "folderTabs" },
  { name: "NotchedCard", tier: "signature", note: "notchedCard" },
  { name: "ContextSwitcher", tier: "signature", note: "switcher" },
  { name: "ScheduleIsland", tier: "signature", note: "schedule" },
  { name: "MobileBottomNav", tier: "signature", note: "mobileNav" },
  { name: "AssistantFab · assistant panel", tier: "signature", note: "assistant" },
  { name: "ProgressRing", tier: "specialized", note: "progressRing" },
  { name: "RingCard", tier: "specialized", note: "ringCard" },
];

export const patternIds = [
  "progress",
  "rings",
  "gauges",
  "charts",
  "tabs",
  "cardGeometry",
  "notches",
  "statusChips",
  "contextColours",
] as const;

export type PatternId = (typeof patternIds)[number];

export type PatternScope = "universal" | "screenSpecific" | "signatureOnly" | "notApproved";

/** Whether each pattern is universal or bound to specific screens, and its board evidence. */
export const patternMeta: Record<PatternId, { scope: PatternScope; evidence: string }> = {
  progress: {
    scope: "universal",
    evidence: "Main · Cards · Shell · S1 · S2 · S3 · S4 · S5 · S6 · S9 · S10 · S11 · S14 · MobileTasks",
  },
  rings: { scope: "screenSpecific", evidence: "Cards (RingCard) · S1 · S4 · S6 · S9 · S11" },
  gauges: { scope: "notApproved", evidence: "—" },
  charts: { scope: "screenSpecific", evidence: "S4 · S6 · S9 · S10 · S12 · S13 · S14" },
  tabs: { scope: "universal", evidence: "Utility · S3 · S4 · S5 · S6 · S7 · S8 · S13 · Cards · MobileTasks · MobileFaTasks" },
  cardGeometry: { scope: "universal", evidence: "CLAUDE.md §2.4 · Rationale · Cards · Shell · every screen" },
  notches: { scope: "signatureOnly", evidence: "CLAUDE.md §4 · Rationale 01 · Cards · Shell · S1 · S2 · S4 · S5 · S6 · S7 · Mobile*" },
  statusChips: { scope: "universal", evidence: "Main · Cards · Utility · S1 · S3 · S4 · S5 · S6 · S8 · S11 · Mobile*" },
  contextColours: { scope: "universal", evidence: "CLAUDE.md §2.2–2.3 · Main · Cards · CommandBar · DarkTokens" },
};

/** Contradictions inside the design package: recorded, not turned into rules. */
export const openQuestionIds = ["blackSurfaces", "volt", "nowPill", "parseChips", "dashboard"] as const;
