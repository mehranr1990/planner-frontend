# Mehran Planner — build guide for Claude Code

A personal + work planner with four contexts: **Personal, Projects, Teams, Companies**.
Soft, premium, "floating islands" UI: sculpted (notched) cards, merged folder tabs, capsule controls, a floating side rail.
Must support **Persian (RTL, default language)**, **Jalali calendar**, **Toman/Rial**, and **light + dark themes**.

**Current phase: build the Personal Planner only** (Projects / Teams / Companies exist only as context references in the shell).

The `design/` folder is the visual source of truth. Rebuild it as clean, componentised code —
do **not** copy the inline styles from the boards.

---

## 1. How to use the design files

```
design/
  CLAUDE.md            ← this file (copy it to the repo root)
  PERSONAL.md          ← FINAL Personal spec: every screen's states, rules, motion, routes, handoff index
  tokens.css           ← colours / radii / shadows, light + dark
  screenshots/         ← one image per board (+ <Board>__<Tab>.jpg for important tabs) — look at these first
  boards/*.dc.html     ← interactive boards (serve the folder; support.js renders them)
```

- Open a board: `npx serve design/boards` → `http://localhost:3000/<Name>.dc.html`. Folder tabs on the boards are clickable.
- **PERSONAL.md is the written spec**; screenshots show the look; the `.dc.html` gives exact copy, data and states.
- After building any screen, take a Playwright screenshot and compare with the matching image.

### Board index (Personal — FINAL)

| Board | Defines |
|---|---|
| `P00CardsTabs` | **Card geometry** (Signature / Product / Utility) + **tab families** (segmented, pills, filled pills, folder tabs, ring-card bottom tabs) |
| `P00PersonalIA` | Flow loop, information architecture, navigation, hidden modules, **routes** |
| `P99Handoff` | Handoff index, superseded boards, reusable components, UX audit, open decisions |
| `P01` Overview · `P02` My Day · `P03TasksList` / `P03TasksBoard` · `P04` Calendar · `P05` Task create · `P06` Task detail | Core screens |
| `P07` Inbox · `P08` Brain Dump · `P09Focus` / `P09FocusBreak` · `P10` Daily shutdown | Capture, execute, reflect |
| `P11` Goals · `P12` Habits · `P13` Finance · `P14` Journal · `P15` Insights · `P16` Weekly review · `P17` Settings · `P18` Supporting flows | Modules, settings, sheets |
| `*Dark` | Dark version of every board above |
| `PM01` core · `PM02` flows · `PM03` modules · `PM04` **Persian RTL** (+ `Dark`) | Mobile 390px |
| `DataVizPersonal` · `DataVizRefine` · `DataVizAdd` · `HabitStreakRibbon` (+Dark/Mobile) | Approved data-visualization language (frozen) |

Foundations still valid: `Main` (older palette — tokens.css wins), `Cards`, `Utility`, `CommandBar` (direction A), `Shell`, `FaRules`, `DarkTokens`, `CaseFlow`.
**Superseded for Personal:** `S1`–`S3`, `S7`–`S14`, `Mobile*`, `MobileFa*` (kept only for history). `S4`–`S6` belong to later phases.

---

## 2. Non-negotiable design rules

1. **No black surfaces.** Black/ink only for text and line icons. Primary = scope `deep` colour (Personal `#0E6B57`).
2. **Scope colours**: Personal green, Projects blue, Teams indigo, Companies purple (`soft` / `deep` / `dot`).
3. **Volt = live / now only** (Now card, running timer, now-dot, Start focus). Never "success". One volt area per viewport.
4. **Card geometry** (P00CardsTabs):
   - **Signature card** — sculpted top-right corner; holds **one** primary circular action **or stays empty** (negative space is part of the identity). Max 3 per desktop viewport (1–2 mobile).
   - **Product card** — 24–28px radius, no notch, optional scope tint.
   - **Utility card** — filters, form groups, settings groups, KPI tiles, empty-state boxes; simple, quiet.
   - **Related families** (KPI tiles, rows, board cards, people) share one clean geometry — **never notch each item**.
   - Never notch: task rows, list/table rows, board cards, inputs, filter panels, settings, sheets, toasts.
5. **Tab families** — pick by meaning, never by taste:
   - view mode → **Segmented** (Day/Week/Month, List/Board, Shamsi/Gregorian)
   - small local filter → **compact pills** · mode needing emphasis → **filled pills** (Focus/Break)
   - sections of ONE object → **FolderTabsCard** (merged tab) · 2–3 views of a compact object → **bottom tabs** (RingCard)
   - global destinations → navigation, never tabs · wizards → stepper
6. **Progress**: number + linear bar by default. Rings only for Today progress (Overview) and the Habit RingCard. No gauges.
7. **Dark**: canvas graphite `#121412`, surfaces step lighter, deep cards `#173A31`, dark volt `#B4F58C`, text on volt/accents = `--on-accent`.
8. **Accessibility**: real buttons/links, ARIA states, visible focus ring, never colour alone, reduced motion respected.
9. **No AI features in this phase** (the old floating Assistant is removed from all Personal screens).

## 3. Locale rules (Persian / Iran)

- Persian is the **default** language; English in Settings. `dir="rtl"` for Persian. Logical CSS only.
- **Mirror**: layout, rail (right side), notch (top-**left**), folder-tab fillets, progress fill, timelines, board column order, swipe directions, arrows. **Don't mirror**: play, clock, check, search, plus, ⌘K, the Focus Clock (clockwise hours), clock digits (LTR island).
- Charts follow the DataViz RTL rules (A = mirror time/flow direction, B = keep geometry). **Never CSS-flip a chart.**
- **Calendar**: Jalali default; week starts **Saturday**; work week Sat–Wed (+Thu half); **Friday** weekend in red; "next working day" after Thursday = Saturday.
- **Digits**: setting ۱۲۳ / 123 (independent of language). `Intl.NumberFormat('fa-IR')`.
- **Money**: Toman default, Rial (×10) switch.
- **Fonts**: Urbanist (Latin), **Vazirmatn** (Persian; placeholder for IRANSans). Persian headings 700, line-height +0.15.
- Mixed text: `dir="auto"` per user line, `<bdi>` for Latin names.
- Mood = 5 levels, energy = 3 levels, **no emoji**.

## 4. Geometry implementation

### Sculpted card — clip-path, not overlays
The boards fake the cut-out with canvas-coloured overlays. In code build `<SignatureCard action? side="end">` with a `clip-path: path()` from a ResizeObserver:

```ts
function notchPath(W: number, H: number, C = 32, nw = 64, nh = 64, f = 28) {
  return `M ${C} 0 L ${W - nw - f} 0 A ${f} ${f} 0 0 1 ${W - nw} ${f}
    L ${W - nw} ${nh - f} A ${f} ${f} 0 0 0 ${W - nw + f} ${nh}
    L ${W - f} ${nh} A ${f} ${f} 0 0 1 ${W} ${nh + f}
    L ${W} ${H - C} A ${C} ${C} 0 0 1 ${W - C} ${H}
    L ${C} ${H} A ${C} ${C} 0 0 1 0 ${H - C} L 0 ${C} A ${C} ${C} 0 0 1 ${C} 0 Z`;
}
// RTL: mirror every x as (W - x) and flip each arc's sweep flag.
```
Sizes: desktop `64×64 / f28` with a 54px button · mobile `56×56 / f24` with a 46px button · Focus `72×72 / f30` with 56px.

### FolderTabsCard (merged tabs)
Active tab: 56px tall, 24px top radius, same surface as the panel, two **20px concave fillets** (left one hidden on the first tab, where the panel's top-left corner becomes square). Inactive tabs: 44px outlined capsules. No gap between active tab and panel. Variants: `top` · `bottom-even` (RingCard). Optional muted count after label. Keyboard ←/→ Home/End, `role=tablist/tab/tabpanel`. On mobile, folder tabs become compact pills above the panel.

## 5. Shell & navigation (Personal)

- **Top bar** islands: logo · context switcher · **schedule island** (volt now-dot) · Search ⌘K · Quick add · bell · avatar.
- **Rail** (floating, icon-only, sticky): Overview, My Day, Tasks, Calendar, Goals, Habits │ Finance, Journal, Insights │ Inbox (badge), Brain Dump · Settings at the bottom.
- Contextual flows (no nav item): Focus (full-screen, shell retreats), Daily shutdown, Weekly review, Task create (page), Task detail (drawer).
- Sheets/drawers/popovers for: quick add, add expense, habit, goal, mood check-in, reschedule, quick note, voice capture (P18 container rule).
- **Mobile**: Today (Overview ⇄ Plan) · Tasks · centre + (long-press = voice) · Calendar · More (sheet with the rest).
- Hidden modules (Settings): Goals, Habits, Finance, Journal, Insights, Brain Dump can be hidden → removed from rail, More, Overview cards, Quick-add types, search. Core (Overview, My Day, Tasks, Calendar, Inbox, Settings) can't.
- Routes: see `P00PersonalIA` → Routes tab (also in PERSONAL.md).

## 6. Stack & architecture decisions

- **Frontend**: Next.js (App Router) + TypeScript + Tailwind, `tokens.css` as CSS variables. (Adapt if the repo already uses something else.)
- **PWA, offline-first ready**: installable PWA; design the data layer (repository + local store, e.g. IndexedDB) so offline sync can be added — **do not implement sync now**.
- **Backend**: NestJS, built by another developer. Put all data access behind a typed API client with **mock fixtures** (from the boards) so the real API can be swapped in.
- **Auth**: Google + email/password + magic link (UI only until the API exists).
- **i18n**: Persian default, English switchable; Jalali utilities (`date-fns-jalali` or dayjs + jalali).

## 7. Build order — Personal (one step per session; stop and show me after each)

1. **Tokens & theming** — `/styleguide` in light/dark × LTR/RTL; digits, Toman/Rial, Jalali utils.
2. **Base components**: Button, IconButton, Chip, Segmented, Pills, Switch, Checkbox, TextField, Select, Toast(undo), Dialog, Sheet/Drawer/Popover, **SignatureCard**, **FolderTabsCard** (+bottom variant), MetricTile, BulkBar, JalaliDatePicker.
3. **Shell**: top bar, schedule island, rail (3 groups + settings), mobile bottom nav + More sheet, routing skeleton (all Personal routes with placeholders).
4. **Core**: P02 My Day → P03 Tasks (list, then board) → P06 Task detail → P05 Task create + Quick Add (P18 H) → P04 Calendar → P01 Overview.
5. **Capture & execute**: P07 Inbox → P08 Brain Dump → P09 Focus/Break → P10 Daily shutdown → P18 sheets (reschedule, quick note, voice).
6. **Modules**: P11 Goals → P12 Habits → P13 Finance → P14 Journal → P15 Insights → P16 Weekly review → P17 Settings.
7. **Data viz components** (from the DataViz boards, used by step 6): Goal Milestone Path, Habit Field, Habit Streak Ribbon, Budget River, Budget Flow, Mood Terrain, Focus Clock, Context Ribbon, Layered Area, Carry-over Flow, Weekly Story.
8. **Mobile (PM01–PM03) + Persian RTL (PM04)** pass on every screen.
9. **Dark pass** against every `*Dark` board.

### Definition of done for every screen
- Matches its screenshot(s) incl. the tab screenshots; all states from its spec tabs in PERSONAL.md exist (empty, loading, error, selected…).
- Light + dark, LTR + RTL, Persian + English digits, 390 / 1024 / 1440 widths, no overflow.
- Interactions and motion as specified (reduced-motion fallback); keyboard accessible; no console errors.
