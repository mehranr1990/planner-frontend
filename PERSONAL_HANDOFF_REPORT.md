# Mehran Planner — Personal frontend: complete handoff report

Audience: another AI assistant (ChatGPT) that will continue this project and lay out the remaining pages.
Project root: `D:\New folder\planner` (Windows). Repo: https://github.com/mehranr1990/planner-frontend (branch `main`).
**Start with §12 (what you can/cannot see) and §13 (working agreements), then §11 (what remains).** Appendix A (§14) lists every file.
Report date: 2026-10-30. Everything below describes the real state of the repository at that moment.

---------------------------------------------------------------------
## 0. TL;DR

- A personal + work planner with four contexts: **Personal, Projects, Teams, Companies**.
- **The whole Personal context (screens P01–P18, mobile, Persian/RTL, dark mode) is built**, mock-data backed, and committed.
- **Projects, Teams, Companies are NOT built.** They are still shell placeholders (`ContextOverview`) — this is the main remaining work.
- No backend exists yet (NestJS, being built by another developer). All data goes through a typed repository seam with in-memory mock adapters, so a real API can be swapped in.
- Quality gates at last full run: TypeScript clean, ESLint clean, production build OK, **Vitest 181 files / 1598 tests**, **Playwright E2E 705/705** (screenshot-generator specs excluded), axe accessibility sweep clean, **Next.js 16.4.3** (security-patched).
- Git: 28 commits. `main` is **3 commits ahead of `origin/main`** (the three Brain Dump fixes: `104a170`, `f2fd68b`, `09453d7` are committed but NOT pushed).

---------------------------------------------------------------------
## 1. Product & design rules (non-negotiable)

Source of truth: root `CLAUDE.md`, `design/CLAUDE.md`, `design/PERSONAL.md` (the written spec for every screen: States, Rules, Motion, Routes), `design/boards/*.dc.html` (interactive boards: exact copy/data/states), `design/screenshots/*.jpg|png`, `design/tokens.css`. Board files are big (60–80 KB of inline-styled HTML): read them with grep/targeted extraction, never in full. Do not copy their inline styles; rebuild as componentised code.

Visual rules:
1. **No black surfaces.** Black/ink only for text and line icons. Primary = scope `deep` colour (Personal `#0E6B57`).
2. Scope colours: Personal green, Projects blue, Teams indigo, Companies purple (`soft/deep/dot`).
3. **Volt (lime `#C8FF3D` light / `#B4F58C` dark) = live / now only** (Now card, running timer, now-dot, Start focus). Never "success". One volt area per viewport (the timeline now-dot is the documented second use).
4. **Card geometry:** *Signature card* = sculpted top-inline-end corner (notch) holding a real circular action (**a notch is never empty**; one action, or two via the "double notch"); max 3 per desktop viewport (1–2 mobile). *Product card* = 24–28px radius, no notch. *Utility card* = filters, forms, settings groups, empty boxes. Never notch task rows, list rows, board cards, inputs, filter panels, settings, sheets, toasts.
5. **Tab families by meaning:** view mode → Segmented; small filter → compact pills; emphasised mode → filled pills (Focus/Break); sections of one object → FolderTabsCard (merged tab); 2–3 views of a compact object → bottom tabs (RingCard); global destinations → navigation, never tabs; wizards → stepper.
6. Progress = number + linear bar. Rings only for Today progress (Overview) and the Habit RingCard. No gauges.
7. **Dark:** graphite canvas `#121412`, surfaces step lighter, deep cards `#173A31`, text on volt/accent = `--on-accent` tokens, no neon glow, depth from surface steps not shadows.
8. **A11y:** real buttons/links, ARIA, visible focus, never colour alone, reduced motion respected, AA contrast, 24px+ targets (design system prefers 44–48px).
9. **No AI features** in the Personal phase (the old floating Assistant FAB is removed from Personal; it still exists via `NonPersonalAssistant` in the other contexts).

Locale rules:
- **Persian is the default**; English switchable; `dir="rtl"` for Persian; **logical CSS only** (`ms/me/ps/pe/start/end`, `inset-inline-*`).
- Mirror in RTL: layout, rail (right side), notch (top-left), folder-tab fillets, progress fill, timelines, board column order, swipe directions, chevrons/arrows. Do NOT mirror: play, clock, check, search, plus, ⌘K, the Focus Clock (clockwise), clock digits (LTR islands).
- Charts: follow each DataViz component's own RTL rule (mirror time/flow direction via coordinates, or keep geometry). **Never CSS-flip a chart.**
- Calendar: **Jalali default; week starts Saturday; work week Sat–Wed + Thursday half day; Friday weekend (red)**; "next working day" after Thursday = Saturday. The week is configuration (`WeekConfig`, default `IRAN_WEEK`) in `src/lib/dates/week.ts`.
- Digits: setting ۱۲۳ / 123, independent of language. Money: Toman default, Rial (×10) switch. Fonts: Urbanist (Latin), Vazirmatn (Persian placeholder for IRANSans). Persian headings 700, line-height +0.15.
- Mixed text: `dir="auto"` per user line, `<bdi>` around Latin names/titles. Mood = 5 levels, energy = 3 levels, **no emoji**.

---------------------------------------------------------------------
## 2. Stack, tooling, how to run

- **Next.js 16.4.3** (App Router, Turbopack, **Cache Components + Partial Prefetching enabled**), **React 19.3.0**, TypeScript strict, Tailwind 4, next-intl, TanStack Query 5, `motion` (Framer successor), Radix UI (`radix-ui`), `@dnd-kit/core|sortable|utilities`, date-fns + date-fns-jalali, zod, react-hook-form, lucide-react, next-themes. Tests: Vitest 5 + Testing Library + jsdom; Playwright + `@axe-core/playwright`.
- **`AGENTS.md` warning:** this Next.js has breaking changes vs. older versions. Read the relevant guide in `node_modules/next/dist/docs/` before using any unfamiliar Next API.
- Scripts: `npm run dev | build | start | lint | typecheck | test | test:e2e`. `typecheck` = `next typegen && tsc --noEmit` (use it after route changes, otherwise stale `.next/types` / `.next/dev/types` can report phantom errors; deleting `.next/dev/types` also fixes that).
- Playwright config: builds and serves the **production build on port 3210** (`reuseExistingServer`). **On this machine the Playwright CDN is blocked: always `PLAYWRIGHT_CHANNEL=chrome`.** Max 4 workers (more crash the browser).
- Windows / Git Bash pitfalls: Git Bash rewrites arguments that look like `/paths` (use `export MSYS_NO_PATHCONV=1` before passing URL paths to node scripts). Another `next dev` cannot start in the same folder while one already runs (the user usually has one on port 3000 — never kill it; use its hot reload, or build/serve on another port).
- Running `next build` while a dev server uses the same `.next` folder, or a second server on the same folder, can cause reload loops / stale assets (this was the real cause of the "/personal/tasks/create reloads in dev" report — not an app bug).
- Sample clock: the app's "now" is fixed for determinism: **Tue 13 Oct 2026 (21 Mehr 1405), 14:35, Tehran (+03:30)**, via `src/data/clock.ts` (`getPlannerToday/getPlannerNow`). Swap it with the API client.

---------------------------------------------------------------------
## 3. Architecture

### 3.1 Folder map (`src/`)
- `app/` — routes. Groups: `(app)` (shell: top bar, rail, mobile nav), `(focus)` (shell-less Focus route), plus `styleguide/*` (design-system docs + demo harness `/styleguide/my-day?state=…`). Personal routes under `(app)/personal/*`. Projects/Teams/Companies: `(app)/projects|teams|companies/page.tsx` (placeholders).
- `components/ui/*` — primitives (button, chip, pills, segmented, tabs, popover, dropdown-menu, sheet, dialog, floating-panel, tooltip, toast(+undo), checkbox, switch, select, date-picker (Jalali), search-field, skeleton, …). `components/shell/*` — app shell (top bar, schedule island, rail, mobile shell, context switcher, command palette, quick-create). `components/navigation/*`, `components/feedback/*` (EmptyState/ErrorState etc.).
- `design-system/` — `tokens/`, `surfaces/` (SignatureCard with clip-path notch from a ResizeObserver, NotchedCard, ProductCard, UtilityCard, FolderTabsCard, RingCard, MetricTile), `data-display/` (all DataViz, see §6), `feedback/` (Progress), `motion/`.
- `data/` — the data seam (§3.2). `fixtures/personal/*` — mock sample data (only the mock adapter may import fixtures; UI never does).
- `features/<name>/` — one folder per screen/domain: `my-day, tasks, calendar, overview, inbox, brain-dump, focus, shutdown, goals, habits, finance, journal, insights, review, settings, reschedule, sheets, planner-settings, preferences, navigation, personal, styleguide`. Pattern: pure logic in `domain/`, hooks, then UI components; tests next to code.
- `lib/` — `dates/` (jalali, gregorian, format, week, clock-time, month-grid, zone), `locale/` (digits, direction, money, bdi), `cn.ts`.
- `messages/{en,fa}/*.json` — one next-intl namespace per area: Common, UI, Feedback, Navigation, Personal, Shell, Settings, MyDay, Tasks, Calendar, Overview, Inbox, BrainDump, Focus, Shutdown, Goals, Habits, Finance, Journal, Insights, Review (+ Home, Styleguide). `messages.test.ts` enforces en/fa key parity and that client namespaces are registered in `src/messages/client.ts`. **Any new namespace used by a client component must be registered there.**
- `proxy.ts` — (Next 16 "proxy", formerly middleware) matcher `/personal/tasks/create` only: strips the `next-url` header so the `@drawer` interception does not swallow Task Create.

### 3.2 The data seam (swap point for the real API)
- `src/data/domain.ts` — plain JSON-shaped types (days `"YYYY-MM-DD"`, instants ISO with offset): Task, TimeBlock (kind task/event/routine/break), Area, InboxItem, BrainDump*, Habit, Goal(+Milestone), JournalEntry/MoodEntry, Finance (transactions, budgets, bills, month summary), Insights types, WeeklyReview, DayPriority, FocusSummary, etc.
- `src/data/repositories.ts` — interfaces: `tasks` (list/get/counts/create/update/setDone/reorder/remove+restore/bulkUpdate/listAreas/listUnscheduled), `blocks` (listForDay/schedule/move/unschedule/setDone/snapshot+restore), `inbox`, `plan` (priorities, focus summary, recordFocusSessions), brain dump, habits, goals, journal, finance, insights, review. All async; reads return deep clones.
- `src/data/mock/*` — in-memory adapters (`createMockRepositories({fixtures, latencyMs})`, mutable per-instance store; used by the app, by tests, and by demo-state harnesses).
- `src/data/queries.ts` + `query-keys.ts` — React Query hooks (read hooks report *pending until hydration* to avoid SSR/client mismatches; every mutation invalidates the relevant key families). `src/data/provider.tsx` (`DataProvider`) is the **single swap point**: pass a typed API-client implementation of `Repositories` instead of the mock.
- Pure filtering/search/sort lives in `src/data/task-query.ts` (Persian-digit/Arabic yeh-kaf normalisation) — adapter's job, never the UI's.
- Undo pattern: mutations that need Undo capture a repository **snapshot taken before the change** (`blocks.snapshot/restore`, `tasks.remove` → `restore`), never state derived from rendered UI.

### 3.3 Settings stores (cookie-backed, server-seeded)
- Display preferences (`features/preferences/*`): locale, theme, digits, calendar (jalali/gregorian), currency.
- Planner settings (`features/planner-settings/*`): module visibility (optional modules hideable; core = Overview, My Day, Tasks, Calendar, Inbox, Settings), week config, work hours (default 09:00–17:00 → 8h capacity), planning defaults (rollover, default duration 30, default energy medium), weekly review day/time, focus (25/5/15, cycles 4, autoStartNext, `dailyGoalMinutes` 240), privacy locks (journal/finance), **insights opt-ins** (`protectedFocus` window, `estimateBuffers` per category). Zod schemas with `.catch(default)` on every field so old cookies always parse.

### 3.4 Routing & overlays
- Personal routes: `/personal` (Overview), `/my-day` (`?date= ?view=day|3days`), `/tasks` (`?view=list|board ?tab=today|upcoming|all|completed ?group= ?sort= ?q=` + filter params), `/tasks/create` (page, prefill from Quick Add), `/tasks/[id]` (P06: **soft navigation = intercepted 520px right drawer** via `@drawer/(.)tasks/[id]`, hard load = full page; mobile = full screen), `/calendar` (`?view=day|week|month|agenda ?cal= ?date=`), `/inbox`, `/brain-dump` (`?date=`), `/focus?task=` (shell-less group), `/shutdown`, `/goals[/id]`, `/habits[/id]`, `/finance`, `/journal[/date]`, `/insights`, `/review[/week]` (index redirects to this week's review; `[week]` = Jalali date of that Saturday), `/settings`.
- `@drawer` slot is cleared on non-task routes by `features/personal/drawer-gate.tsx` (pathname gate). A catch-all page in the slot used to do this but made the `(app)` tree claim every `/personal/*` URL and **shadowed `/personal/focus` (404)** — do not reintroduce a slot catch-all.
- **Global sheet host** (`features/sheets/sheet-host.tsx`): `?sheet=quick-add|expense|habit|goal|mood|reschedule|note|voice` works on any Personal route. Container rule (P18): drawer 420px for habit/goal, centred sheet for quick-add/expense/mood/reschedule(by URL), floating panel desktop for note/voice; bottom sheet below `lg`. Sheets arriving *with* the URL wait until the page has hydrated (`use-page-hydrated.ts`: document `load` + idle) to avoid an aria-hidden hydration mismatch; Escape/Back remove only the sheet param and return focus to the opener. Hidden-module sheets show "Module hidden".
- Hidden modules: `ModuleGate` renders the page or a "Module hidden · Turn on" state that is the page `h1`.

### 3.5 Implementation conventions that matter
- **SSR safety:** never touch `window/document/HTMLElement` during render or in state initialisers; no React internals.
- **Contrast:** never express text colour as an opacity of a scope colour; muted text on tinted/green surfaces uses `text-current` or the `muted-on-tint` utility (dark only; also swaps `--danger-text` for `--danger-on-tint`).
- No ref writes during render (`react-hooks/refs`) — use `useLayoutEffect`.
- Persian typography: type scale in `src/styles/typography.css` (`type-display/h1/h2/title/body/caption/label`, each with a `:lang(fa)` override; `type-h2` = 26/1.15/600 EN, 24/1.45/700 FA). Don't force `font-semibold leading-[…]` over these under `:lang(fa)`.
- Latin text inside RTL: `<bdi dir="auto">`; truncating Latin titles in RTL: `<bdi dir="auto" class="inline-block truncate">`.
- dnd-kit: use `MouseSensor` + `TouchSensor`(delay 200/tolerance 8) + a keyboard sensor (`PointerSensor` conflicts with `TouchSensor`); dnd-kit `delta` includes scroll, so track real pointer coordinates; the keyboard sensor needs the custom setup in `features/my-day/timeline/keyboard-sensor.ts`.
- Overflow clipping: a permanent `overflow-hidden` wrapper clips focus rings and overlays (Brain Dump bug). Clip only inside exit animations.
- JSX: a `{/* */}` comment cannot sit before an element inside a ternary branch (use `//` in that position).
- Business logic belongs in pure `domain/` modules + the adapter, never in presentational components. No fixture imports in UI. No new dependencies without asking.

---------------------------------------------------------------------
## 4. Screen-by-screen status (all Personal screens are BUILT)

Legend: **Built** = implemented, unit-tested, reviewed with browser checks at some stage. Most screens after P02 were verified by unit tests + targeted browser/route sweeps only (the owner reviews UI by hand and reports problems).

### P01 Overview — `/personal` (`features/overview`)
Greeting with name/date, energy chip, "Plan my day"; Today hero (signature card with "Open My Day" in the notch, progress ring = the only ring besides habits; tiles: tasks, habits, focus incl. daily goal, mood·energy); live slot (reuses My Day `NowCard`; five states: morning, live (default), free gap with a task that fits, evening shutdown suggestion, first run + 3-step tour; Later/Dismiss persist for the planner day in localStorage, tour Skip is permanent); cards: Up next, Tasks (tick in place), Habits (real Habit Streak Ribbon), Goals/Mood/Finance minis (compact only — never the full DataViz), Insight (deep card, links to `/personal/insights?tab=focus`). Hidden modules remove their cards and the bottom row re-flows. Mobile = summary first (Now card, 3 numbers, Up next, streak ribbon).
Deviations: two notched cards (hero + Now) vs spec "one notch"/board three (≤3 rule respected). Journal lock hides the mood tile/card content.

### P02 My Day — `/personal/my-day` (`features/my-day`) — the reference implementation
Header: Energy selector (Low/Medium/High), capacity pill ("6h 15m of 8h planned" + bar + "free" chip; rose when over), prev/next day, ⋯ menu (Daily shutdown). Timeline signature card (notch = Add block): 64px/hour, hour labels at inline-start, scope tints, break/done(hatched)/current/overlap block variants, Now line + volt dot, "Drop a task here" free slot, gap hints in partial state, Day / 3-days view, protected-focus band (when enabled). Right column: Now card (volt, notch = Mark done), Focus entry card (Pomodoro, notch = Start focus), Priorities, Unscheduled (Today/Overdue/This week pills, draggable rows, `S` auto-fit). Drag & drop: unscheduled→timeline, block→block/day, drop on Unscheduled unschedules, resize by edges (pointer + Shift/Alt+Shift+arrows), keyboard (Space/↑↓/←→/Enter/Esc), touch long-press, 15-min snap, overlap allowed but flagged (never silent) + Undo toast, out-of-range rejected. Reschedule popover/bottom sheet. Mobile "Plan" layout (compact header, bounded scrolling timeline, Unscheduled tray above bottom nav). Six spec states reachable only through the demo harness `/styleguide/my-day?state=normal|empty|partial|overloaded|no-current|after-hours[&reschedule=<blockId>][&view=3days]` and the "My Day · states" styleguide section.
Data decisions (do not undo): "35m left" on the Now card = remaining *effort* (`Task.spentMinutes`), not time to block end; capacity excludes `break` blocks; capacity "overloaded" also when overlaps exist; `Task.time` without a block is "scheduled" per P03 and simply absent from P02 lists.

### P03 Tasks (List + Board) — `/personal/tasks` (`features/tasks`)
List: header (kicker, h1, progress pill "N of 9 done today · …" denominator = Today tab count), List|Board switch, New task; toolbar (tabs with counts, search with `/`, Filters popover/sheet: Area/Context/Priority/Energy/Labels/Has date/Recurring, Group menu, Sort menu, removable filter chips). Rows 52px (check, title, meta, priority, energy bars, duration, when), collapsible groups (Overdue/Morning/Afternoon/Evening/Unscheduled; also by Date/Area/Priority/None), inline edit, selection (⇧/⌘/X/long-press) + bulk bar (Schedule/Move/Priority/Complete/Delete, Undo), drag-reorder (planDrop), completion lifecycle (1.2 s struck hold → collapse into "· N done"), add-task row with `quickParse` (`!high ~15m tomorrow 18:00`, Persian tokens), keyboard map (N / J K X E D S 1–4 ⌘↵ B Space). States: all done, no tasks, no match, Completed view, Upcoming view (date headers, weekend red, capacity), loading/error. Mobile: 56px rows, swipe toward end = complete, toward start = reschedule (mirrors in RTL), long-press select, filters sheet.
Board: columns by Horizon (Today·Tomorrow·This week·Later + Done rail) / Time of day / Status; column header count/duration/capacity bar; overdue strip; drag between columns sets date (Tomorrow on Friday → Saturday via shared week helpers; drop on Later clears date; drop on This week with no working day left is refused with a toast); drop on Done completes; mobile snap pages + pager.
Notes: clicking the row circle completes (selection is ⇧/⌘-click, X, or long-press). Board capacity uses work hours (not calendar free hours). Tasks fixtures were extended (see §9).

### P04 Calendar — `/personal/calendar` (`features/calendar`)
Day/Week/Month/Agenda, Shamsi/Gregorian (`?cal=` via a `PreferencesOverride`), prev/Today/next, "+ New" (opens Quick Add), side column (selected event panel, mini month, Unscheduled). Week/Day reuse My Day's `TimelineGrid` (drag/resize/keyboard/Reschedule); Month cells show ≤2 chips + "+N", keyboard-navigable grid, drag sets a date without time; Agenda 14 days; scope layer chips (Personal always on; hidden layers in localStorage). Mobile: 7-day strip over a one-day grid.
Gaps: no all-day row; Projects/Teams/Companies blocks are still draggable in Week (should be "Managed in Projects"); "+ New" does not pre-fill the clicked slot.

### P05 Task Create + Quick Add — `/personal/tasks/create`, `?sheet=quick-add` (`features/tasks/create`)
Quick Add: live-parsing input ("Understood as" chips), type pills Task/Event/Note/Expense/Inbox (Expense only when Finance visible); Enter creates a task (default Today/Unscheduled) with Undo; Details/Ctrl+Enter → create page prefilled (`?title= &date= …&from=`); Note/Expense open their sheets; Event/Inbox go to their pages with a "later step" note. Create page: 4-step stepper (Capture → Details → Schedule → Done), title/context/date/estimate/priority/energy, More options (repeat on/off, area, labels, notes), Schedule panel (two free slots + keep unscheduled), Create another, auto-return to `from` after 2.5 s. Shows the "Plans as 1h 30m" hint when an estimate buffer applies.
Gaps: Tab doesn't open Details (Ctrl+Enter does); repeat is on/off only; no subtasks/reminder/linked goal/dependencies/preview card. **Create still uses its own date options (`useScheduleOptionsFor`), by design (initial scheduling, not rescheduling).**

### P06 Task Detail — drawer/page (`features/tasks/detail`)
Signature header card (notch = Complete → Reopen), chips (status/priority/when/repeat), Start focus (volt), Reschedule (shared surface), Move, ⋯ (Duplicate, Convert to event "coming soon", Delete with confirm + 10 s Undo); six property rows editable in place (linked goal read-only, links to `/personal/goals/:id`), description, FolderTabsCard Subtasks/Notes/Activity/Links; completed drawer stays 1.2 s then closes with Undo; recurring completion shows next date; dependency warning. Keys: Ctrl/⌘+Enter, F, D.
Gaps: ↑/↓ navigation in the list behind the drawer; recurring "Change"; add file/link display-only; Activity isn't written on edits (sample entries only).

### P07 Inbox — `/personal/inbox` (`features/inbox`)
Triage/Snoozed/Archived pills (`?tab=`), Today/Earlier groups, source filter, suggestion chips, Select mode + bulk bar, capture field; Process card (the page's signature card; notch = Skip →; "1 of N"; six destinations with the suggestion pre-selected; quick-parse understanding); Snooze popover (Jalali picker); Undo toasts; inbox-zero; "Processed N items" summary; failed-transcription state; keyboard shortcuts (skip key mirrored in RTL). Repository supports capture/snooze/archive/process/drop/restore; snoozed items return with "back from snooze". Sending to Task/Brain Dump/Journal is real; Event/Note/Reminder only mark the item processed ("kept for a later step").
Gaps: mobile swipe stack, real Retry for failed transcripts, card Edit link.

### P08 Brain Dump — `/personal/brain-dump` (`features/brain-dump`)
One page per day (new page at 04:00; older via `?date=`), auto-save after 600 ms (Saving…/Saved/Offline chip), plain textarea lines (Enter splits, Backspace merges, multi-line paste splits, `- ` and `[] ` shortcuts), per-line actions Task/Note/Journal/Event/Inbox/Strike, sorted lines muted with a "→ destination" tag, Select lines + bulk, "Send rest to Inbox", Clear page (3 modes), history sidebar. **Line actions live in a fixed "⋯" menu slot at the inline end of every line** (reserved 36px, opacity-only reveal on hover/focus, always visible on touch) — an earlier overlay bar covered the next line and an even earlier inline bar caused layout jumps. The notch holds "Voice capture". Task conversion creates real tasks; Journal conversion appends to today's entry; Note/Event only tag.
Gaps: Note/Event data models; Journal-lock privacy rule not applied here.

### P09 Focus / Break — `/personal/focus?task=` (shell-less `(focus)` group, `features/focus`)
Pure timer state machine (focus/short/long break, cycles from settings, autoStartNext, pause/resume/skip/extend/finish; elapsed from timestamps with an injectable clock), persisted per viewer (localStorage) so it keeps running after "Leave focus"; schedule island chip + My Day Focus card show the running state ("running mm:ss", notch → "Back to focus"). States: running, paused, waiting, break, long break, session complete, no task. Filled pills for Focus/Short break/Long break; focus-preset signature card (notch always Pause/Resume/Start); volt only while focus actually runs; LTR clock island; polite announcements only on phase/status changes; quick note saves to task Notes; distractions parked → Inbox at session end; completed cycles recorded via `plan.recordFocusSessions`.
Gaps: "Notifications paused"; mobile side panels stack instead of sheets; a running session is not replaced when opening Focus for another task.

### P10 Daily Shutdown — `/personal/shutdown` (`features/shutdown`)
3-step stepper (`?step=`); outcome tiles (Completed/Tomorrow/Overdue/Back to inbox); route list (7 destinations per unfinished task, Send all to, multi-select, rose hint for tasks moved 3+ times — `Task.movedCount`); Tomorrow signature card (notch opens tomorrow in My Day; compact hour list, Auto-arrange by energy then priority, capacity bar, "Tomorrow is full" suggestion; uses protected window + buffers); Reflect (mood 5 levels dot+word, energy 3-way, what went well, note); nothing is written until **Finish day** (bulk writes + Undo toasts); "Day closed" card. Reachable from the Overview evening card and My Day ⋯.
Gaps: no Carry-over Flow chart here (tiles stand in); `movedCount` isn't incremented by real moves.

### P11 Goals — `/personal/goals[/id]` (`features/goals`)
List (product cards, number + one bar, Active/Completed/Archived) beside the selected goal on desktop; on mobile list and goal are separate pages (the goal page keeps a screen-reader-only h1). Selected goal = FolderTabsCard (Journey/Key results/Linked/Notes, `?tab=`) whose panel is the only signature card (notch = Edit). States: empty (See examples), simple, delayed (amber + suggestion + Adjust deadline), completed (Reflect in Journal link). "Plan next step" creates a linked task (Undo). Goal sheet `?sheet=goal[&goal=id]`. Uses the **Goal Milestone Path** chart.
Gaps: no "Add key result" write; milestones not editable in the edit sheet; list filter not in URL; a goal completed in the last 3 days stays under Active.

### P12 Habits — `/personal/habits[/id]` (`features/habits`)
Today tiles (tap = done; long-press/right-click/Shift+F10 menu: skip, rest, log amount, clear — all with Undo), Habit Field card with KPI tiles (best streak, completion; `?period=14d|month|year`), selected habit head = the only signature card (notch = Check today), Habit Streak Ribbon, RingCard (History = 4 months, Details = frequency/target/time/reminder/best streak/Edit/Archive); <7 days of data hides the ring. Habit sheet `?sheet=habit[&habit=id|&title=]` (name, icon, frequency, target, time of day, reminder stored only). Skipped/rest days don't break streaks.
Gaps: Year-view cells not clickable; phones show 7 days for the 14-day period; log amount is an inline form.

### P13 Finance — `/personal/finance` (`features/finance`)
Header: Toman/Rial switch (saved), month switch (`?month=1405-07`), Add expense; FolderTabs Overview/Trends/Breakdown/Transactions (`?tab=`). Overview: balance signature card (notch = Add expense), 4 KPI tiles, budget-vs-actual bars (over-budget rose marker + text), upcoming payments, recent transactions. Trends = **Budget River**; Breakdown = **Budget Flow**; Transactions = search, category filter, All/Expenses/Income, Today/Earlier groups, edit via `?tx=`, delete with Undo. Expense sheet: amount keypad (typed in display currency, stored in Toman), category chips, date, note; Quick Add Expense passes `?text=` ("250k lunch #food"). States: empty (+ Set budget form), sparse (<5 transactions), Rial, locked (placeholder on `privacy.financeLock`; Unlock reveals for the visit; Overview finance card shows "Locked"). Fixture month Mehr matches the board (46 tx, 31.2M of 48M, balance 186.4M). Category colours follow `tokens.css` (Housing green, Food coral) although the PERSONAL.md prose says Housing coral.

### P14 Journal — `/personal/journal[/date]` (`features/journal`)
Composer = the one signature card (notch = "Prompt me"): 5 moods, 3 energy levels, tags, What went well, Reflection, prompts; auto-save 600 ms; side column: **Mood Terrain** + Recent entries (month switch, search, check-in-only rows, Delete with Undo). States: empty, sparse, locked (like Finance), loading/error. Mood sheet `?sheet=mood` saves to today's entry with Undo. Inbox/Brain Dump "→ Journal" append to the day's entry.
**Concurrent-save fix:** `saveEntry(day, patch)` applies only the supplied fields over the *current* stored entry; the composer sends only changed fields plus `baseText`, and the adapter rebases lines appended meanwhile (`rebaseJournalText`) so mood updates/Inbox appends are never overwritten by a stale autosave.
Gaps: no Dictate button; notes from the mood sheet/Shutdown go into the entry text.

### P15 Insights — `/personal/insights` (`features/insights`)
Period (4 weeks/3 months/Year), headline deep signature card (notch = "Why this?"; "Plan around it" → My Day), 3 observation cards (Time/Estimates/Habits), FolderTabs Focus (Focus Clock) / Time (Context Ribbon) / Signals (Layered Area) / Estimates / Habits↔mood (`?tab ?period`). States: no data ("about 2 weeks" threshold), partial ("Collecting · 6 of 14 days"), per-tab threshold + error/retry, skeletons. Hidden Habits module removes its tab/card. Opt-in actions (never automatic) write planner settings:
- **Protect 09:00–12:00** → `insights.protectedFocus` (window enabled/start/end). Effect: My Day suggestions (auto-fit `S`, free-slot placeholder, gap hints, Reschedule later today/tomorrow/this week), Calendar reschedule and Shutdown Auto-arrange avoid the window (use it only if nothing else fits); existing blocks never move; manual placement still allowed; a faint "Protected focus" band on timeline grids + a visually-hidden description "Protected focus window, 09:00 – 12:00." (band itself `aria-hidden`).
- **+50% estimate** → `insights.estimateBuffers` = per-category percent (e.g. `{design: 50}`), **not a global multiplier**. Planning duration = raw × (1+pct) rounded up to 5 min (`planningDurationMinutes`) used for slot fitting in Task Create, My Day auto-fit/gap hints, Calendar reschedule, Shutdown load; the user's raw `durationMinutes` is never rewritten and blocks keep their own length. Category matching uses **stable ids only** (label slug / area id, with a small alias table so "Design" and "طراحی" both → `design`; area display names are never matched).
Cards show accepted state (Applied/Protected) with Turn off (Undo for Protect). Time card on the board says 52% but its own ribbon data sums to 37%; the computed value is shown.

### P16 Weekly Review — `/personal/review[/week]` (`features/review`)
Five steps (Wins → Carry over → Goals → Plan → Reflect, `?step=`), **Weekly Story** above all steps (metrics jump to the matching step), side summaries (habits + mood as two numbers). Carry over reuses Shutdown's `RouteList`/`routeWrites()`; Plan = up to 3 priorities + next-week strip with per-day capacity (Thu half, Fri red), place by tap or drag; draft saved ("Save & exit" resumes); Finish applies writes, appends the reflection to today's Journal entry tagged `weekly`, marks complete. States: loading/error/invalid week (404)/too early (opens after 3 days of the week or any past week)/done (Edit review). Notch of the Story card = "Share summary" (system share sheet or copied text). Hidden modules drop the Goals step and habit/mood numbers. Uses **Carry-over Flow** (tiles on phones).
Note: Weekly Review and Insights mood signals still compute from mood data while the Journal lock is on (product decision pending).

### P17 Settings — `/personal/settings` (`features/settings`)
Sticky in-page index with "Search settings" and 10 Utility-card groups (Appearance, Language & region, Calendar, Planning, Focus, Modules, Finance, Notifications, Privacy, Data & account; mobile = pushed panels with Back, CSS-only switch). Edits every field of both stores (theme/language/digits/calendar/currency; module switches; week start + per-day work/half/weekend/off with a "no working day" guard; work hours, default duration/energy, rollover radio; weekly review day/time; focus options, auto-start, daily goal slider; journal/finance locks; Insights opt-ins). Saves instantly with "Settings saved · Undo"; "Reset planner settings" with Undo. Delete-account dialog (type DELETE, Export first) is UI-only. Rows with no store/API yet (reduced motion, density, time format, reminders, free slots, month start, categories, nudges, import/export, archive, Google/email/magic-link sign-in) are read-only "Not available yet".

### P18 Supporting sheets (`features/sheets`, `features/reschedule`)
- **Reschedule (shared):** ONE `RescheduleSurface` (popover desktop / bottom sheet <lg) + `rescheduleOptions` domain (`features/my-day/domain/reschedule.ts`, week-aware: later today, tomorrow, next working day, this week, pick date & time, back to unscheduled). Consumers pass an allowed-options list: Tasks list/board/bulk/row/keys/swipe and P06 detail get "This week"; My Day and Calendar keep their original set. Target-aware wording (task vs block; "Move N tasks"/"Move N blocks"). Undo restores a repository snapshot. "Next working day" row is hidden when it equals Tomorrow (Tuesday sample day). `?sheet=reschedule` takes `?task=`/`?block=` or shows a task picker.
- **Quick note** (`?sheet=note`, ⌘⇧N on Personal routes — Ctrl+Shift+N is reserved by Chrome on Windows): Save as note / → Inbox / → Brain Dump.
- **Voice capture** (`?sheet=voice`): Web Speech API feature-detected (fa-IR/en-US); recording/paused/transcribing/editable transcript/error states; "Create task" reopens Quick Add with `?text=`, "Send to Inbox" saves a capture with source "voice". No convert-to-note/journal/event pills.

---------------------------------------------------------------------
## 5. Cross-cutting systems (where the logic lives)
- Planning domain (pure): `features/my-day/domain/*` — day-blocks, capacity, overlap, placement (`snap15`, `resolvePlacement`, `suggestFreeSlot`, `protectedSpan`, `autoFit`, `nextFreeSlot`), gaps/fit hints, window, energy ordering, now/next, reschedule options, unscheduled, priorities. Reused by Calendar, Shutdown, Weekly Review, Task Create.
- Estimate buffers: `features/planner-settings/estimate-category.ts` (`labelCategoryId`, `planningTags`) + `planningDurationMinutes` in `planner-settings.ts`.
- Tasks domain (pure): `features/tasks/domain/*` — group, time-of-day, progress, when, selection, quick-parse, reorder/planDrop, board, completion, filters, keyboard, url-state, query.
- Time helpers: `lib/dates/clock-time.ts` (minutes ↔ "HH:mm" ↔ instants with +03:30, day arithmetic).
- Locks: Journal/Finance lock = view-level placeholder (no PIN/biometrics); Overview cards hide content while locked.
- Shared UI helpers added along the way: `components/ui/use-is-desktop.ts`, `use-long-press.ts`, `energy-bars.tsx`, `features/personal/page-metadata.ts` (`personalPageMetadata`), `features/personal/drawer-gate.tsx`.

---------------------------------------------------------------------
## 6. DataViz inventory (`src/design-system/data-display/`, all with tests)
Habit Streak Ribbon, Habit Field, Goal Milestone Path, Budget River, Budget Flow, Mood Terrain, Focus Clock (used on Insights only), Context Ribbon, Layered Area, Carry-over Flow, Weekly Story, plus Progress Ring. RTL is done by mirroring coordinates (or `dir`), never CSS flips; keyboard inspection on the interactive ones; reduced-motion fallbacks. Overview uses **only compact mini versions** (not these components, except the streak ribbon).

---------------------------------------------------------------------
## 7. Quality status & how verification was done
- Last full gate (2026-10-30, Next 16.4.3): `tsc` clean · `eslint` clean · `next build` OK · **Vitest 181 files / 1598 tests** · **Playwright 705/705** (specs: a11y, components, global, my-day, my-day-interactions, personal, shell, styleguide) · axe sweep over Personal routes in light/dark × LTR/RTL, 390/1024/1440, no violations. The two screenshot-generator specs (`screenshots.spec.ts`, `my-day-shots.spec.ts`) are intentionally excluded (they assert nothing).
- Dedicated passes completed: Mobile 390 + Persian/RTL pass over 52 URLs; final Dark pass over 49 URLs (no black surfaces, volt only live, AA contrast, no glow; fixed current-block glow, muted-on-tint contrast, calendar counts, toast viewport, Shutdown over-capacity warning contrast, Budget Flow de-emphasis).
- Canonical visual references: `e2e/screenshots/final/overview-{1440-light-en,1440-dark-fa,390-light-en,390-dark-fa}.png`.
- Honest caveat: only P02 got a full vision comparison against its board. Other screens were verified by unit tests, route/overflow/contrast sweeps and spot browser checks; real device touch behaviour (iOS/Android) was never tested.
- Working mode agreed with the owner ("lean mode"): minimal tokens — one agent per screen, no parallel fan-out, no new e2e specs or screenshot matrices, no repeated full build/test loops; run `tsc` + `eslint` + targeted vitest per change; run the full gate once at the end of a phase; the owner reviews the UI and reports problems.

---------------------------------------------------------------------
## 8. Git state
- 28 commits on `main`. History: baseline → design package unpack → Wave 1 (1A tokens/locale, 1B card geometry/tab families, 1C shell/settings/data seam) → fixes → P02–P14 + P18 → P15/P16/P17 → shared Reschedule → Insights opt-ins → consistency fixes → Overview minis → mobile/RTL pass → dark pass → contrast fixes → final stabilization → Next 16.4.3 → Brain Dump fixes.
- `main` is **3 commits ahead of origin** (not pushed): `104a170` (Brain Dump hover/ring), `f2fd68b` (wrapper clipping), `09453d7` (⋯ menu slot). Push with `git push origin main` (never force-push).
- Untracked: this report file (`PERSONAL_HANDOFF_REPORT.md`) — not committed.

---------------------------------------------------------------------
## 9. Sample data (fixtures) — important decisions
Fixed sample day Tue 13 Oct 2026, now 14:35. Boards contradict each other; **P02 won for My Day** and the data was aligned to it:
- `t-reply-katy-brief` time=null (unscheduled); `t-plan-weekend-trip` 65 min; `t-renew-car-insurance` moved to Thursday.
- Added: `TimeBlock.kind "break"` (lunch, morning-routine; not counted in capacity), `TimeBlock.energy`, `Task.spentMinutes`, `plan` repository (priorities, focus summary), `Task.order/createdAt/goalTitle/movedCount`, subtasks/notes/activity/links on `t-ui-design`, extra tasks (5 km run, haircut, monthly budget review, 4 undated "Later" tasks, 6 completed older tasks, area "Social"), goal titles, extra calendar blocks for the rest of the week, three months of finance transactions, habits/goals/journal/insights fixtures.
- Tasks with a `time` but no block (check-in notes 16:00, read 30 pages 20:00) are "scheduled" for P03 but absent from the P02 timeline/unscheduled list.
- Derived counts today: Today 9 · Upcoming 7 · All 28 · Completed 9 (board shows 9·14·42 — ours are computed, not hard-coded).

---------------------------------------------------------------------
## 10. Known issues and limitations (aggregated)
Product/data:
- No backend; everything is in-memory mock (state resets on reload). No auth (Google/email/magic-link are UI-only placeholders). No offline sync (data layer is merely designed to allow it).
- Models missing for Event/Note/Reminder (Inbox/Brain Dump only tag/mark them), key results, goal progress history, all-day events, repeat rules beyond on/off, focus notifications.
- Journal/Finance locks are placeholders; Weekly Review/Insights still read mood data under the Journal lock (decision pending).
- Insights opt-ins: matching of estimate buffers is by stable ids/aliases only (Persian free-text labels not in the alias table won't match); Task Create slot rows show raw time ranges (by design, with a separate "Plans as…" hint).
- Calendar: Projects/Teams/Companies blocks draggable; no all-day row; "+ New" doesn't prefill slot.
- Task detail: no ↑/↓ list navigation; Activity not written on edit. Goals: no key-result writes. Habits: Year cells not clickable.
- `Task.movedCount` is not incremented by moves.
UI/QA:
- Several standalone text links are 16–20px tall (Insights cross-tab links, Finance "All transactions", Journal date links, back-to-goals) — covered by WCAG spacing exception.
- Voice capture and Quick note shortcut: `Ctrl+Shift+N` is intercepted by Chrome on Windows.
- Most screens were not visually compared against their boards by an image pass (see §7).
Tooling:
- Dev: do not run two `next dev`/build processes on the same folder (reload loops/stale assets). The first `next build` after a long idle on Next 16.4.0 occasionally stopped with a "security upgrade" nudge; 16.4.3 no longer shows it.

---------------------------------------------------------------------
## 11. WHAT REMAINS — instructions for the next assistant

### 11.1 Projects, Teams, Companies (the main remaining work)
Current state: `/projects`, `/teams`, `/companies` render `ContextOverview` (a labelled placeholder: one hero, three product cards, a dashed strip, text from `Shell.placeholder.*`; the file itself says "delete when real overviews are built"). The shell already knows the four contexts (context switcher, scope colours, `data-scope`, context nav lists in `features/navigation/contexts.ts`, `ComingSoonBadge`). The Assistant FAB (`NonPersonalAssistant`) still shows outside Personal.
Design sources: `design/boards/S4Project.dc.html`, `S5Team.dc.html`, `S6Company.dc.html` (+ screenshots `S4Project.png`, `S5Team.png`, `S6Company.png`, `Dashboard.png`) — **these are older "S" boards that were *not* refreshed to the final P-series rules** (card geometry, tab families, notch rule, token set). CLAUDE.md says they "belong to later phases". The first job is therefore a **reconciliation/design pass**: map each S-board to the P-series system (Signature/Product/Utility cards, FolderTabs vs Segmented vs pills by meaning, notches never empty, ≤3 signature cards, volt only live), decide routes (mirror the Personal route table style), then write a per-context spec (like PERSONAL.md) before coding.
Suggested build approach (reuse, do not rebuild):
1. Per context: Overview → primary list/board → detail (drawer pattern like P06) → create/edit sheets → context-specific modules, in that order, one screen per step.
2. Reuse the Personal systems: the `Task.scope` field already supports project/team/company; Tasks list/board (filters have a Context facet), Calendar scope layers (project/team/company blocks exist; "Managed in Projects" read-only rule is pending), Reschedule, FolderTabsCard, DataViz components, sheet host pattern (extend `SheetId`s), `ModuleGate`/planner-settings module registry (extend for per-context modules), shell schedule island.
3. Add repositories to `src/data` for projects/teams/companies (+ mock adapters, fixtures only via adapters, hooks, tests) following the existing pattern; keep UI free of fixture imports.
4. i18n: new namespaces per context in `src/messages/{en,fa}` registered in `client.ts`; Persian natural copy; RTL/dark/mobile per the standing rules from day one (it is much cheaper than a later pass).
5. Decide the AI/Assistant question explicitly before touching those contexts (CLAUDE.md: no AI in the Personal phase; the FAB still exists elsewhere).

### 11.2 Backend integration (separate track; do not start before the owner says so)
- NestJS backend is built by another developer. Implement the `Repositories` interface (`src/data/repositories.ts`) as a typed API client and pass it to `DataProvider`; keep the mock for tests/demos. Replace `src/data/clock.ts`. Server prefetch (`HydrationBoundary`) can replace the "pending until hydration" wrapper in `queries.ts`. Add optimistic updates where UX needs them. Revisit: the Board's second unfiltered tasks query for "x of y match" counts (gate it before a real API); `Task.movedCount`, undo snapshots (server-side restore endpoints), journal patch/rebase semantics, planner settings persistence (currently cookies).
- Auth UI exists only as placeholders in Settings. PWA/offline: "installable PWA, offline-first ready" is a stated goal but sync must NOT be implemented until asked.

### 11.3 Small follow-ups worth batching (all optional, owner decides)
Push the 3 unpushed commits; Task Create ↔ shared Reschedule (initial scheduling intentionally separate); Calendar read-only rule for non-Personal blocks and all-day row; goals key results; Task detail list navigation; Projects/Teams tasks `movedCount`; Journal lock semantics for Review/Insights; remove the remaining screenshot-generator specs or keep them for visual refs; consider a real visual regression process (only P02 was image-compared).

### 11.4 Definition of done for any new screen (from CLAUDE.md)
Matches its screenshot(s) and every state in its spec tab (empty, loading, error, selected…); light + dark, LTR + RTL, Persian + English digits, 390/1024/1440, no horizontal overflow; interactions + motion as specified with reduced-motion fallback; keyboard accessible; no console errors; en/fa messages with identical keys; targeted unit tests; run tsc + eslint + targeted vitest, then the full gate once per phase.

### 11.5 How to brief an implementation agent effectively (what worked here)
Give it: the exact board/spec section (with grep hints, not whole files), the list of existing modules to reuse by path, the data-seam additions it may make, explicit "do not" list (no new deps, no redesign, no e2e/screenshots unless asked), the gate commands to run, and ask for a short structured report (what changed, files, deviations, known gaps). Keep one screen per task, commit per task, and have the owner review in the browser.

---------------------------------------------------------------------
## 12. READ THIS FIRST if you are ChatGPT — what you can and cannot see

- **You cannot open the repository.** Every path in this report (`src/features/tasks/…`) refers to files on the owner's PC. You can only work from this report plus whatever files the owner pastes or uploads to you. When you need a file, **ask the owner to paste it** (the inventory in Appendix A tells you exactly which file to ask for).
- **This report is a summary, not the specification.** The detailed per-screen spec (every state, exact copy, motion tables, route table) is in `design/PERSONAL.md`; the visual boards are `design/boards/*.dc.html` (huge inline-styled HTML — never paste them whole) and `design/screenshots/*`. The owner's own rules for the project are `CLAUDE.md` (root) and `design/CLAUDE.md`. For Projects/Teams/Companies the sources are `design/boards/S4Project.dc.html`, `S5Team.dc.html`, `S6Company.dc.html` and their screenshots. **Ask the owner to give you `design/PERSONAL.md`, `design/CLAUDE.md`, root `CLAUDE.md`, and the specific screenshots/board sections for whatever you are working on.**
- **You cannot run code.** You cannot run tsc/eslint/vitest/Playwright or look at the running app. Anything you write must be verified by the owner (or by a coding agent with repo access, e.g. Claude Code, which is what built everything so far). Prefer producing: (a) specs/layout descriptions, (b) precise implementation prompts for a coding agent, (c) code the owner can paste and test.
- **If you cannot see a detail, say so and ask — do not invent.** Component props, hook signatures, message keys and fixture ids in this report are partial; the real source is the truth.

## 13. Working agreements with the owner (follow these)

Communication: the owner writes in Persian; reply in Persian unless asked otherwise; keep reports short and concrete (what changed / files / checks run / known gaps). Say plainly when something was not verified.
Process rules the owner set during this project:
1. **One task at a time; STOP after each task.** Never start the next screen/task on your own. Ask before expanding scope.
2. **Lean mode (default):** minimal token use — one agent/pass per screen, no parallel fan-out, no new E2E specs, no screenshot matrices, no repeated full build/test loops. Gate per change = typecheck + eslint on changed files + targeted unit tests. Run the *full* gate (tsc, eslint, build, full Vitest, full E2E incl. axe) **once at the end of a phase**. The owner reviews the UI by hand and reports problems (often with screenshots) — fix only what is reported.
3. **No redesign, no new features, no unrelated refactors** when asked for a QA/polish/fix task. Fix the root cause once in the shared component/token rather than patching each page.
4. **Do not install dependencies** without asking. Do not run `next upgrade` or broad dependency upgrades (the owner did one explicit patch upgrade 16.4.0 → 16.4.3).
5. **Git:** commit each task separately on `main` with a clear message; **do not push unless the owner says so**; never force-push; remote `origin` = https://github.com/mehranr1990/planner-frontend.git. (Commit trailer used: `Co-Authored-By: Claude … <noreply@anthropic.com>`.)
6. Never kill the owner's dev server on port 3000; use other ports (3210 for Playwright's production server; 33xx for ad-hoc servers) and stop what you start.
7. Treat design files as the source of truth; when boards contradict each other or the spec, pick by this order: the screen's own final board → `PERSONAL.md` → `P00` card/tab rules → existing reusable component rules, and **report the deviation explicitly** (several such decisions are listed in this report).
8. Notches are never empty: even where a board leaves the corner empty, put a real action there and report it (this was decided for Weekly Story, Inbox Process card, Brain Dump, etc.).
9. Persian/RTL, dark mode, mobile 390 and accessibility are part of "done", not a later pass — build them in from the start for new screens.

### Ready-to-paste starting prompt for ChatGPT
> You are helping me continue "Mehran Planner", a Persian-first (RTL, Jalali) personal+work planner built with Next.js 16 / React 19 / Tailwind 4 / TanStack Query / next-intl. The entire Personal context (screens P01–P18, mobile, dark, RTL) is finished and pushed (except 3 local Brain Dump commits). Projects, Teams and Companies are still placeholders. I attach `PERSONAL_HANDOFF_REPORT.md` (read all of it, especially §1 rules, §3 architecture, §11 what remains, §12–13 how to work) and I will paste design files (`design/PERSONAL.md`, `CLAUDE.md`, board screenshots) when you ask. You cannot run code, so: (1) first list which files/screens you need from me for the Projects context; (2) then reconcile the old S4 Projects board with the final Personal design rules and produce a full page-by-page layout/spec (routes, states, components to reuse, data additions, RTL/mobile/dark notes) in the same style as the P-series; (3) then give me one self-contained implementation prompt per screen that I can hand to Claude Code. Work one screen at a time, stop after each deliverable, keep answers in Persian, and never invent details you cannot see — ask me.

---------------------------------------------------------------------
## 14. APPENDIX A — file inventory (generated from the repo)

Non-test source files per feature (tests sit next to them as `*.test.ts(x)`). Use this to know which file to open, or to ask the owner to paste.

**features/brain-dump** (6 files): brain-dump-line.tsx, brain-dump-overlays.tsx, brain-dump-screen.tsx, domain/brain-dump.ts, use-brain-dump-actions.ts, use-brain-dump-draft.ts

**features/calendar** (14 files): agenda-view.tsx, calendar-context.tsx, calendar-screen.tsx, calendar-toolbar.tsx, domain/calendar-params.ts, domain/layers.ts, domain/month-cells.ts, domain/navigation.ts, month-dnd.tsx, month-view.tsx, selected-event-panel.tsx, use-calendar-data.ts, use-calendar-format.ts, week-view.tsx

**features/finance** (8 files): domain/finance.ts, expense-sheet.tsx, finance-charts.tsx, finance-overview.tsx, finance-rows.tsx, finance-screen.tsx, finance-transactions.tsx, use-finance-format.ts

**features/focus** (13 files): domain/timer.ts, focus-break-card.tsx, focus-capsule.tsx, focus-complete.tsx, focus-pick.tsx, focus-running.tsx, focus-screen.tsx, focus-settings-sheet.tsx, focus-side-panels.tsx, focus-store.ts, focus-timer-card.tsx, use-focus-format.ts, use-focus-sync.ts

**features/goals** (6 files): domain/goals.ts, goal-detail.tsx, goal-list.tsx, goal-panels.tsx, goal-sheet.tsx, goals-screen.tsx

**features/habits** (10 files): domain/habits.ts, habit-field-card.tsx, habit-ribbon.tsx, habit-sheet.tsx, habits-screen.tsx, selected-habit.tsx, today-tile.tsx, ui/habit-icons.ts, ui/use-habit-format.ts, use-habit-actions.ts

**features/inbox** (6 files): domain/inbox.ts, inbox-row.tsx, inbox-screen.tsx, process-card.tsx, snooze-menu.tsx, use-inbox-actions.ts

**features/insights** (4 files): domain/insights.ts, insights-screen.tsx, pattern-panels.tsx, use-insights-format.ts

**features/journal** (8 files): domain/journal.ts, journal-composer.tsx, journal-recent.tsx, journal-screen.tsx, journal-trend.tsx, mood-check-in.tsx, ui/mood-picker.tsx, use-journal-draft.ts

**features/my-day** (64 files): domain/capacity.ts, domain/day-blocks.ts, domain/energy.ts, domain/gaps.ts, domain/now.ts, domain/overlap.ts, domain/placement.ts, domain/priorities.ts, domain/reschedule.ts, domain/unscheduled.ts, domain/window.ts, drag.ts, drop-registry.tsx, header/capacity-pill.tsx, header/day-nav.tsx, header/energy-selector.tsx, header/my-day-header.tsx, header/overload-bar.tsx, header/use-day-plan.ts, my-day-context.tsx, my-day-screen.tsx, rail/focus-card.tsx, rail/focus-entry.tsx, rail/index.ts, rail/now-card.tsx, rail/priorities-card.tsx, rail/unscheduled-card.tsx, rail/unscheduled-list.tsx, rail/unscheduled-row.tsx, rail/unscheduled-tray.tsx, rail/use-auto-fit.tsx, rail/use-mark-done.tsx, rail/use-now-block.ts, rail/use-unscheduled-drop.ts, rail/use-unscheduled.ts, reschedule/plan-reschedule.ts, reschedule/reschedule-host.tsx, reschedule/reschedule-panel.tsx, reschedule/use-reschedule-actions.ts, reschedule/use-reschedule-session.ts, states/empty-day-state.tsx, timeline/apply-drop.ts, timeline/clock-text.tsx, timeline/drag-ghost.tsx, timeline/drag-overlay-card.tsx, timeline/drag-state.tsx, timeline/drop-plan.ts, timeline/geometry.ts, timeline/index.ts, timeline/keyboard-sensor.ts, timeline/keyboard.ts, timeline/my-day-dnd.tsx, timeline/now-line.tsx, timeline/resize.ts, timeline/slot-placeholders.tsx, timeline/time-block.tsx, timeline/timeline-card.tsx, timeline/timeline-grid.tsx, timeline/timeline-model.ts, timeline/use-block-resize.ts, timeline/use-day-data.ts, ui/energy-bars.tsx, ui/scope-style.ts, ui/use-my-day-format.ts

**features/navigation** (5 files): contexts.ts, paths.ts, types.ts, use-active-navigation.ts, use-nav-state.ts

**features/overview** (17 files): cards/day-strip.tsx, cards/finance-card.tsx, cards/goals-card.tsx, cards/habits-card.tsx, cards/insight-card.tsx, cards/live-slot-card.tsx, cards/mood-card.tsx, cards/tasks-card.tsx, cards/today-hero.tsx, cards/up-next-card.tsx, domain/habits.ts, domain/live-slot.ts, domain/slot-dismissals.ts, overview-screen.tsx, ui/card-parts.tsx, ui/mood.ts, use-overview-today.ts

**features/personal** (7 files): drawer-gate.tsx, page-metadata.ts, pages.ts, review-week.ts, routes.ts, task-detail.tsx, today-switch.tsx

**features/planner-settings** (7 files): estimate-category.ts, module-hidden-state.tsx, modules.ts, planner-settings-cookie.ts, planner-settings.ts, request-planner-settings.ts, use-planner-settings.tsx

**features/preferences** (5 files): locale-root.tsx, preferences-cookie.ts, preferences-store.ts, request-preferences.ts, use-preferences.tsx

**features/reschedule** (5 files): plan-reschedule.ts, reschedule-panel.tsx, reschedule-sheet.tsx, use-reschedule-actions.ts, use-reschedule-session.ts

**features/review** (4 files): domain/weekly.ts, review-screen.tsx, review-steps.tsx, use-weekly-review.ts

**features/settings** (2 files): settings-model.ts, settings-screen.tsx

**features/sheets** (6 files): quick-note.tsx, sheet-host.tsx, sheet-params.ts, use-page-hydrated.ts, use-speech-capture.ts, voice-capture.tsx

**features/shutdown** (6 files): domain/shutdown.ts, reflect-card.tsx, route-list.tsx, shutdown-screen.tsx, tomorrow-card.tsx, use-shutdown.ts

**features/styleguide** (71 files): component-samples.ts, components-view.tsx, my-day/demo-data.tsx, my-day/demo-params.ts, my-day/drag-preview.tsx, my-day/mount-when-visible.tsx, my-day/my-day-demo.tsx, my-day/reschedule-preview.tsx, navigation-view.tsx, pages.ts, preview-controls.tsx, preview-frame.tsx, preview-scope-control.tsx, rules-data.ts, rules-view.tsx, samples.ts, sections/bdi-section.tsx, sections/borders-section.tsx, sections/components/buttons-section.tsx, sections/components/cards-section.tsx, sections/components/choices-section.tsx, sections/components/controls-section.tsx, sections/components/data-display-section.tsx, sections/components/date-picker-section.tsx, sections/components/fields-section.tsx, sections/components/folder-tabs-section.tsx, sections/components/form-section.tsx, sections/components/indicators-section.tsx, sections/components/menus-section.tsx, sections/components/metric-tiles-section.tsx, sections/components/my-day-states-section.tsx, sections/components/overlays-section.tsx, sections/components/product-card-section.tsx, sections/components/progress-section.tsx, sections/components/ring-card-section.tsx, sections/components/select-section.tsx, sections/components/states-section.tsx, sections/components/tabs-section.tsx, sections/components/toasts-section.tsx, sections/components/unit-menu.tsx, sections/components/utility-card-section.tsx, sections/context-section.tsx, sections/dataviz-section.tsx, sections/dates-section.tsx, sections/focus-section.tsx, sections/icons-section.tsx, sections/motion-section.tsx, sections/navigation/live-shell-section.tsx, sections/navigation/mobile-section.tsx, sections/navigation/nav-list-section.tsx, sections/navigation/page-header-section.tsx, sections/navigation/rail-section.tsx, sections/navigation/schedule-section.tsx, sections/navigation/switcher-section.tsx, sections/navigation/top-bar-section.tsx, sections/neutrals-section.tsx, sections/numbers-section.tsx, sections/radii-section.tsx, sections/shadows-section.tsx, sections/spacing-section.tsx, sections/status-section.tsx, sections/surfaces-section.tsx, sections/sweep-section.tsx, sections/typography-section.tsx, styleguide-messages.tsx, styleguide-page-nav.tsx, styleguide-section.tsx, styleguide-shell.tsx, styleguide-view.tsx, tier-badge.tsx, use-sample-shell-data.ts

**features/tasks** (49 files): board/board-card.tsx, board/board-column.tsx, board/board-context.tsx, board/done-rail.tsx, board/task-board.tsx, board/use-board.ts, bulk/bulk-bar.tsx, create/create-draft.ts, create/parsed-chips.tsx, create/quick-add.tsx, create/task-create-screen.tsx, detail/detail-tabs.tsx, detail/task-detail-view.tsx, domain/board.ts, domain/completion.ts, domain/detail.ts, domain/filters.ts, domain/group.ts, domain/keyboard.ts, domain/progress.ts, domain/query.ts, domain/quick-parse.ts, domain/reorder.ts, domain/selection.ts, domain/time-of-day.ts, domain/types.ts, domain/url-state.ts, domain/when.ts, list/add-task-row.tsx, list/inline-edit.tsx, list/list-context.tsx, list/task-group.tsx, list/task-list.tsx, list/task-parts.tsx, list/task-row.tsx, list/use-list-keyboard.ts, list/use-task-actions.ts, mobile/use-row-touch.ts, states/tasks-states.tsx, tasks-context.tsx, tasks-screen.tsx, toolbar/filters-panel.tsx, toolbar/tasks-toolbar.tsx, ui/priority-style.ts, ui/use-filter-chip-text.ts, ui/use-tasks-format.ts, use-completion.ts, use-tasks-query.ts, use-today-progress.ts

**design-system/surfaces** (10 files): floating-island.tsx, folder-tabs-card.tsx, metric-tile.tsx, notch-path.ts, notched-card.tsx, product-card.tsx, ring-card.tsx, signature-card.tsx, surface.tsx, utility-card.tsx

**design-system/data-display** (12 files): budget-flow.tsx, budget-river.tsx, carry-over-flow.tsx, context-ribbon.tsx, focus-clock.tsx, goal-milestone-path.tsx, habit-field.tsx, habit-streak-ribbon.tsx, layered-area.tsx, mood-terrain.tsx, progress-ring.tsx, weekly-story.tsx

**components/ui** (35 files): alert-dialog.tsx, avatar.tsx, badge.tsx, button.tsx, calendar.tsx, checkbox.tsx, chip.tsx, date-picker.tsx, dialog.tsx, dropdown-menu.tsx, energy-bars.tsx, field.tsx, floating-panel.tsx, form-error-summary.tsx, icon.tsx, input.tsx, pills.tsx, popover.tsx, radio-group.tsx, scroll-area.tsx, search-field.tsx, segmented.tsx, select.tsx, separator.tsx, sheet.tsx, skeleton.tsx, slider.tsx, spinner.tsx, switch.tsx, tabs.tsx, textarea.tsx, toast.tsx, tooltip.tsx, use-is-desktop.ts, use-long-press.ts

**components/shell** (23 files): app-shell.tsx, assistant-fab.tsx, assistant-panel.tsx, command-palette.tsx, context-overview.tsx, context-placeholder.tsx, mobile-shell.tsx, non-personal-assistant.tsx, notifications-popover.tsx, page-header.tsx, personal-mobile.tsx, profile-menu.tsx, quick-create.tsx, schedule-island.tsx, schedule.ts, scope-boundary.tsx, shell-actions.tsx, shell-context-switcher.tsx, shell-frame.tsx, shell-island.tsx, shell-provider.tsx, top-bar.tsx, use-shell-ui.ts

**data (seam + mock adapters)** (16 files): clock.ts, domain.ts, mock/index.ts, mock/mock-brain-dump.ts, mock/mock-finance.ts, mock/mock-goals.ts, mock/mock-habits.ts, mock/mock-insights.ts, mock/mock-journal.ts, mock/mock-repositories.ts, mock/mock-review.ts, provider.tsx, queries.ts, query-keys.ts, repositories.ts, task-query.ts

**lib** (14 files): cn.ts, dates/clock-time.ts, dates/date-param.ts, dates/format.ts, dates/gregorian.ts, dates/jalali.ts, dates/month-grid.ts, dates/week.ts, dates/zone.ts, locale/bdi.tsx, locale/config.ts, locale/digits.ts, locale/direction.ts, locale/money.ts

**Playwright specs (e2e/)**: a11y.spec.ts, components.spec.ts, global.spec.ts, my-day-interactions.spec.ts, my-day-shots.spec.ts, my-day.spec.ts, personal.spec.ts, screenshots.spec.ts, shell.spec.ts, styleguide.spec.ts; helpers in `e2e/support/`.
