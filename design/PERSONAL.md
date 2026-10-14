# Personal Planner — FINAL design spec (source of truth)

This file is generated from the specification tabs of the final boards (`boards/P*.dc.html`, `boards/PM*.dc.html`).
Each section = one board. **Screenshots:** `screenshots/<Board>.jpg` (+ `<Board>__<Tab>.jpg` for important tabs).
The S-boards (S1–S14, Mobile*, MobileFa*) are **superseded** for Personal — see P99 below.

Read order for a new session: `CLAUDE.md` → this file (P00 sections first) → the screenshot of the screen you build → open its `.dc.html` for exact data and states.

How the boards show specs: below every screen is a folder-tab card (States / Rules / Motion). Visualizations inside screens are rendered snapshots of the approved DataViz boards — their exact behaviour (hover, tooltip, morph, RTL, empty) is defined in `DataVizPersonal`, `DataVizRefine`, `DataVizAdd`, `HabitStreakRibbon` (+ Dark / Mobile).


---

## P00 · Card Geometry & Tab Families  
`boards/P00CardsTabs.dc.html` · `screenshots/P00CardsTabs.jpg` · dark: `P00CardsTabsDark`

#### Card geometry · 3 levels

- **A · Signature · action in notch (one primary action)** — Now · UI design · My Day · 14:00 – 16:00 · 35m left
- **A · Signature · EMPTY notch (negative space as identity)** — INSIGHT · Your best focus is 09–12 on Sat–Mon.
- **A · Signature · navigation action** — SELECTED GOAL · Launch Planner v1 · 64% · Beta on 20 Aban
- **B · Product card** — PRODUCT CARD · Run 100 km this month · 41% · 5 km tomorrow · Soft rounded rectangle · no notch · may be scope-tinted
- **C · Utility card** — UTILITY CARD · Filter · Area · Group by · Time of day · Quiet, compact, simple geometry
**RELATED FAMILY · one geometry, no individual notches**

Focus hours

21h

+3h vs last week

Tasks completed

of 40 planned

On-time rate

82%

+6 pts

Average mood

Good

steady


#### Rules

- **Signature card** — Standalone, important product object. Sculpted top-right corner (64px cut, 28px fillets). May hold ONE primary action (54px circle) — or stay empty as negative space. May carry live state (volt).
- **Product card** — Standard surface. 24–28px radius, optional scope tint, moderate content, no notch.
- **Utility card** — Filters, form groups, settings groups, KPI tiles, empty-state containers. 16–20px radius, #F8F8F6 or white, no decoration.
- **Standalone vs grouped** — One important object → signature allowed. Repeated / dense → product or utility. Related family (KPIs, metric groups, people, rows) → one shared clean geometry, never a notch per item.
- **Empty notch** — Allowed and encouraged on 1 card per view when it creates hierarchy (Insight, Weekly Story, Goal summary). Do not stuff an icon into every cut-out.
- **Action in notch** — Exactly one action, always circular, always the card’s primary (Start focus, Open, Expand, Add). Never a menu of icons. Secondary actions live inside the card.
- **Never notch** — Task rows, list items, table rows, board cards, inputs and form sections, filter panels, settings groups, KPI tiles, chart tiles in a grid, toasts, sheets.
- **Density** — Max 3 signature cards per desktop viewport (Overview and My Day use 3), 1–2 per mobile viewport. Only one may be volt.
- **RTL** — The sculpted corner mirrors to top-left; action stays in it.
- **Dark** — Notch background = page graphite #121412; card surface steps #1C1F1C; the corner reads by surface contrast, no outline.


#### Where in Personal · 15 screens

| Final screen | Signature card(s) | Notch content |
| --- | --- | --- |
| P01 Overview | Today hero · Now card · Insight | Open My Day · Mark done · empty |
| P02 My Day | Timeline · Now card · Focus card | Add block · empty · Start |
| P03 Tasks | — (dense utility surface) | — |
| P04 Calendar | Selected event panel (S7 precedent) · week grid | Open · Add |
| P06 Task Detail | Drawer head | Complete |
| P07 Inbox | Current triage item (process mode) | empty |
| P08 Brain Dump | Scratchpad sheet | empty |
| P09 Focus / Break | Timer card | Pause / Resume |
| P10 Shutdown | Tomorrow plan card | Finish day |
| P11 Goals | Selected goal (folder-tabs object) | Edit goal |
| P12 Habits | Selected habit ring card (bottom tabs) | Check today |
| P13 Finance | Balance summary | Add expense |
| P14 Journal | Today’s entry composer | empty |
| P15 Insights | Headline insight | empty |
| P16 Weekly Review | Weekly Story | empty |


#### Tab families · 4

**A · SEGMENTED SWITCHER · view mode**

Day

Week

Month

Shamsi

Gregorian

**B · COMPACT PILL TABS · local filter / secondary mode**

Today

Overdue 1

This week

**C · FILLED PILL TABS · active mode needs emphasis**

Focus

Short break

Long break

**D · FOLDER / MERGED TABS · sections of ONE object (click the tabs)**

72%

Progress

72%

Open tasks

Blocked

Tasks panel

Files panel

Activity panel

**D′ · RING CARD WITH BOTTOM TABS**

History

Details

Read 30 pages

Completion · Mehr

88%

done

84%

Tir

90%

Mord

76%

Shah

88%

Mehr

Read 30 pages

Completion · Mehr

88%

done

Frequency

Daily

Target

30 pages

Reminder

20:00

Best streak

21 days

- **Selection rule** — View mode → Segmented. Small local option → Compact pills. Mode needing emphasis → Filled pills. Sections of one object → Folder tabs. Global destination → Navigation (rail / bottom nav), never tabs.
- **Folder geometry** — Active tab is 56px tall, 24px top radius, shares the panel background and connects with 20px concave fillets on both sides (left fillet hidden on the first tab, where the panel corner becomes square). Inactive tabs are 44px outlined capsules. No gap between active tab and panel.
- **Bottom tabs** — Same geometry flipped (RingCard). Equal-width uppercase labels. Use for 2–3 views of one compact object (History / Details).
- **Do not use folder tabs for** — Global navigation, Day/Week/Month, List/Board, binary toggles, dense filter sets, wizard steps.
- **Counts** — Optional count after the label (12px, muted). Never coloured badges inside folder tabs.
- **RTL / Dark** — Fillets mirror with direction. In dark the panel and active tab use the card surface #1C1F1C on graphite #121412.
- **Component** — One reusable FolderTabsCard {tabs[], value, onChange, variant: top | bottom-even, surface}. Keyboard: ←/→ moves, Home/End, role=tablist/tab/tabpanel.
- **Applied in Personal** — Goal detail (Journey · Key results · Linked) · Habit detail (History · Details, bottom) · Finance (Overview · Trends · Breakdown · Transactions) · Insights (Focus · Time · Signals · Estimates) · Task detail (Subtasks · Notes · Activity · Dependencies) · Journal (Write · Entries) · spec sections of every P-board.



---

## P00 · Personal IA & Flow Map  
`boards/P00PersonalIA.dc.html` · `screenshots/P00PersonalIA.jpg`

#### Flow loop · 5 stages

**1 · CAPTURE**

Quick Add

centre + · ⌘K

Voice

transcript

Inbox

triage

Brain Dump

free writing

**2 · ORGANIZE**

Tasks

list · board

Calendar

week · month · agenda

Goals

milestone path

Habits

field · ribbon

**3 · EXECUTE**

My Day

timeline · capacity

Focus

pomodoro · break

Finance

add expense · budget

**4 · REFLECT**

Daily shutdown

route · tomorrow · reflect

Journal

mood · energy · writing

Insights

patterns

Weekly review

story · carry-over

**5 · ADJUST**

Reschedule

shared popover

Planning

tomorrow · next week

Settings

defaults · modules

Loop · Adjust feeds the next capture and plan

| From | To | How |
| --- | --- | --- |
| Quick Add / Voice / share | Inbox | no date or unknown type → Inbox; with date → Task/Event directly |
| Brain Dump | Inbox · Task · Note · Journal · Event | line actions; “Send rest to Inbox” |
| Inbox | Task · Event · Note · Journal · Reminder · Brain Dump | triage card / bulk |
| Tasks · Goals · Habits | My Day · Calendar | schedule = drag to timeline / board column; Goal “Plan next step” creates a linked task |
| My Day / Task detail / Now card | Focus | Start focus (volt) |
| Focus | Inbox · Task notes | parked distractions; quick notes |
| My Day end / Overview evening | Daily shutdown | optional suggestion (Start / Later / Dismiss) |
| Daily shutdown | Tomorrow (My Day) · Inbox · Journal | route chips · arrange tomorrow · reflection |
| Journal · Focus · Tasks data | Insights | patterns after thresholds |
| Insights | My Day · Settings | opt-in actions (protect 09–12, +50% estimates) |
| Weekly review | Goals · next week’s Tasks · Journal | carry-over routing · priorities · #weekly entry |
| Settings | everything | defaults, modules, rollover rule |


#### Information architecture

**PRIMARY · RAIL GROUP 1**

Overview

P01

My Day

P02

Tasks

P03 list · board

Calendar

P04

Goals

P11

Habits

P12

**UTILITY · rail bottom**

Settings

P17

**RAIL GROUP 2 · optional**

Finance

P13

Journal

P14

Insights

P15

**RAIL GROUP 3 · capture**

Inbox

P07 · badge

Brain Dump

P08

**CONTEXTUAL FLOWS · full surface, no nav item**

Focus / Break

P09 · full-screen

Daily shutdown

P10

Weekly review

P16

Task create

P05 · page

Task detail

P06 · drawer

**MODAL / SHEET FLOWS · P18**

Add expense

sheet

Habit create/edit

drawer

Goal create/edit

drawer

Mood check-in

popover

Reschedule

popover

Quick note

floating

Voice capture

floating

Universal Quick Add

sheet

**MOBILE NAVIGATION**

Today

Tasks

Calendar

More

Today = Overview ⇄ Plan (My Day). More sheet = Goals · Habits · Finance · Journal · Insights · Inbox · Brain Dump · Settings + Finish day · Weekly review.

- **Hidden module** — Removed from rail, More sheet, Overview cards, Quick Add types, search and notifications. Rail separators collapse if a group becomes empty.
- **Deep link to hidden** — Route renders the module’s “hidden” empty state with “Turn on” (P17 · States).
- **Core** — Overview, My Day, Tasks, Calendar, Inbox and Settings cannot be hidden.
- **Onboarding** — No module hidden at start. First-run card on Overview highlights My Day · Tasks · Calendar with a 3-step tour (skip anytime) and says unused modules can be hidden in Settings.


#### Routes · 18

| Route | Board | Container | Params / notes |
| --- | --- | --- | --- |
| /personal | P01 | page | Overview |
| /personal/my-day | P02 | page | ?date=1405-07-21 · ?view=day/3days |
| /personal/tasks | P03 | page | ?view=list/board · ?tab=today/upcoming/all/completed · ?group=horizon/time/status |
| /personal/tasks/:id | P06 | drawer over current route (mobile: page) | keeps underlying route |
| /personal/tasks/new | P05 | page | prefill from Quick Add |
| /personal/calendar | P04 | page | ?view=week/month/agenda · ?cal=shamsi/gregorian |
| /personal/inbox | P07 | page | ?tab=triage/snoozed/archived |
| /personal/brain-dump | P08 | page | ?date= (one page per day) |
| /personal/focus | P09 | full-screen (no shell) | ?task=:id · state focus/short/long/paused |
| /personal/shutdown | P10 | page (contextual) | ?step=route/tomorrow/reflect |
| /personal/goals/:id? | P11 | page | ?tab=journey/results/linked/notes |
| /personal/habits/:id? | P12 | page | ?period=14d/month/year |
| /personal/finance | P13 | page | ?tab=overview/trends/breakdown/transactions · ?month= |
| /personal/journal/:date? | P14 | page | locked → lock screen |
| /personal/insights | P15 | page | ?tab=focus/time/signals/estimates/habits · ?period= |
| /personal/review/:week | P16 | page (contextual) | ?step=1..5 |
| /personal/settings | P17 | page | #appearance … #data |
| ?sheet=quick-add/expense/habit/goal/mood/reschedule/note/voice | P18 | sheet / drawer / popover | any route; closes back |



---

## P99 · Personal Handoff Index  
`boards/P99Handoff.dc.html` · `screenshots/P99Handoff.jpg`

#### Handoff index · 19 screens

| Screen | Reference board | Mobile | Dark | Important components | Interactions | Visualization |
| --- | --- | --- | --- | --- | --- | --- |
| Overview | P01PersonalOverview | PM01 · Today/Overview | P01…Dark | SignatureCard, NowCard, TodayRing, MetricTile, StreakRibbon(compact), InsightCard | inline check, Now→Focus, evening Shutdown card | Today ring · Habit Streak Ribbon |
| My Day | P02MyDay | PM01 · Today/Plan | P02…Dark | Timeline, TimeBlock, CapacityBar, EnergySwitch, UnscheduledList, ReschedulePopover, FocusEntryCard | drag/resize 15m, auto-fit S, overload | — |
| Tasks · List | P03TasksList | PM01 · Tasks | P03TasksListDark | TaskRow, GroupHeader, FilterChips, BulkBar, InlineEditor, Toast | complete+undo, reorder, inline edit, bulk, shortcuts | — |
| Tasks · Board | P03TasksBoard | PM01 · Board | P03TasksBoardDark | BoardColumn, BoardCard, DoneRail, BulkBar | drag = reschedule, group by horizon/time/status | — |
| Calendar | P04Calendar | PM01 · Calendar | P04CalendarDark | WeekGrid, MonthGrid, AgendaList, ScopeLayerChips, EventPanel, UnscheduledTray | drag/resize, Shamsi⇄Gregorian | — |
| Task create | P05TaskCreate | PM01 · Quick Add → Details | P05TaskCreateDark | CaptureParser, Stepper, SlotSuggestions, MoreOptions | parse tokens, progressive disclosure | — |
| Task detail | P06TaskDetail | PM01 · Task detail | P06…Dark | Drawer, SignatureCard head, PropertyRow, FolderTabsCard | complete in notch, inline props | — |
| Inbox | P07Inbox | PM02 · Inbox | P07…Dark | InboxRow, ProcessCard, DestinationGrid, SnoozePopover, BulkBar | triage keys, process 1 of N | — |
| Brain Dump | P08BrainDump | PM02 · Brain Dump | P08…Dark | DayPages, ScratchSheet, LineActions, ConvertPopover | auto-save, line → destination | — |
| Focus · Break | P09Focus · P09FocusBreak | PM02 · Focus/Break | P09…Dark ×2 | FocusShell, TimerCard, CycleDots, QuickNote, DistractionPark, BreakCard | pause/resume, finish task/session, skip break | — (no Focus Clock) |
| Daily shutdown | P10Shutdown | PM02 · Shutdown ×3 | P10…Dark | RouteChip, RouteRow, TomorrowPlanner, ReflectForm, BulkBar | route, auto-arrange, undo, Finish day | Carry-over Flow (daily) |
| Goals | P11Goals | PM03 · Goals/Detail | P11…Dark | GoalCard, FolderTabsCard, KeyResultRow, LinkedList | select goal, plan next step | Goal Milestone Path |
| Habits | P12Habits | PM03 · Habits · PM04 | P12…Dark | HabitTile, HabitField, RingCard (bottom tabs), StreakRibbon | tap/long-press log, select habit | Habit Field · Habit Streak Ribbon · RingCard |
| Finance | P13Finance | PM03 · Finance ×2 · PM04 | P13…Dark | BalanceSignatureCard, MetricTile, BudgetBar, PaymentRow, TxRow, FolderTabsCard | tabs, month switch, add expense | Budget River (Trends) · Budget Flow (Breakdown) |
| Journal | P14Journal | PM03 · Journal | P14…Dark | ComposerSheet, MoodPicker5, EnergySwitch3, EntryCard, LockScreen | auto-save, prompts, lock | Mood Terrain (compact) |
| Insights | P15Insights | PM03 · Insights | P15…Dark | HeadlineInsight, ObservationCard, FolderTabsCard | period/metric morph, opt-in actions | Focus Clock · Context Ribbon · Layered Area · simple bars |
| Weekly review | P16WeeklyReview | PM03 · Weekly | P16…Dark | Stepper, WeeklyStory, RouteRow, MetricTile | steps 1–5, routing | Weekly Story · Carry-over Flow (weekly) |
| Settings | P17Settings | PM03 · Settings | P17…Dark | SettingsGroup, SettingRow, Switch, Segmented, ValuePopover | instant save, module hide | — |
| Supporting flows | P18SupportingFlows | PM01–PM02 sheets | P18…Dark | Sheet, Drawer, Popover, Keypad, VoicePanel, QuickAddBar | save → toast → highlight | — |


#### Superseded boards · 15

| Old board | Final board | Status |
| --- | --- | --- |
| S1Personal | P01PersonalOverview | refined |
| S2MyDay (+Dark) | P02MyDay (+Dark) | refined |
| S3TaskDetail | P06TaskDetail | redesigned (Personal drawer) |
| S7Calendar (+Dark) | P04Calendar (+Dark) | reused + refined |
| S8TaskCreate (+Dark) | P05TaskCreate (+Dark) | reused + refined |
| S9Habits | P12Habits | redesigned |
| S10Finance | P13Finance | redesigned |
| S11Goals | P11Goals | redesigned |
| S12Journal | P14Journal | redesigned |
| S13Insights | P15Insights | redesigned |
| S14Weekly | P16WeeklyReview | redesigned |
| MobileHome · MobileTasks | PM01MobileCore | superseded |
| MobileFaHome · MobileFaTasks · MobileFaQuickAdd · MobileFaCalendar (+Dark) | PM04MobileFa (+PM01 patterns) | superseded for Personal (FaRules stays) |
| DataVizPersonal §03 Milestone Path | DataVizAdd · Goal Milestone Path | superseded (approved earlier) |
| DataVizPersonal §03/04/08 v1 | DataVizRefine v2 | superseded |


#### Reusable components · 16

- **SignatureCard** — sculpted corner, optional single action, side=right|left, surface
- **FolderTabsCard** — top | bottom-even, counts, keyboard, RTL fillets
- **RouteChip / RouteRow** — Shutdown + Weekly review + Reschedule
- **ReschedulePopover** — shared from My Day, Tasks, Calendar, Shutdown
- **BulkBar** — floating selection bar (Tasks, Board, Inbox, Shutdown)
- **TaskRow** — list row 52px, inline edit
- **BoardCard / BoardColumn** — horizon board
- **Timeline / TimeBlock** — My Day + Shutdown tomorrow + mobile Plan
- **MetricTile family** — KPI groups (never notched)
- **MoodPicker5 · EnergySwitch3** — Journal, Shutdown, Mood check-in
- **ProcessCard** — Inbox one-by-one
- **ScratchSheet** — Brain Dump
- **TimerCard · CycleDots** — Focus
- **Sheet · Drawer · Popover · FloatingPanel** — P18 container rule
- **QuickAddBar + parser** — tokens EN + FA
- **Toast (undo)** — white surface, mint icon


#### UX audit · 12

- **Duplicate concepts** — Notes card in My Day removed (Quick Note is global). Reflection merged into Journal. Comments → Notes for Personal.
- **Redundant charts** — River and Flow never together (Finance tabs). Terrain only in Journal, Layered Area only in Insights. Ring only Today + Habit RingCard; S11 goal ring removed.
- **Conflicting actions** — One primary per signature card. Start focus is volt everywhere; Complete is mint.
- **Navigation overload** — 11 rail items in 3 groups + Settings; contextual flows not in nav. Mobile 4 tabs + More.
- **Inconsistent tabs** — Segmented = view modes; pills = local filters & mobile section tabs; folder tabs = sections of one object; stepper = wizards.
- **Inconsistent progress** — Number + linear bar everywhere except approved Today ring, Habit RingCard and Goal path.
- **Cards & notches** — ≤3 signature cards per desktop viewport, ≤1–2 mobile; none on rows, tiles, settings, sheets.
- **Assistant / AI** — Floating Assistant removed from all P boards (AI out of scope).
- **RTL** — PM04 validates lists, board, sheets, Inbox, Brain Dump, Focus, Shutdown, Finance flow, Goal path, Habit ribbon, Quick Add parsing.
- **Dark** — Dark variants for every destination board P01–P18 + all mobile boards; deep cards use graphite-mint #173A31, volt #B4F58C.
- **Mobile dead ends** — Every PM screen has back or bottom nav; sheets close to origin; Focus/Shutdown have explicit exits.
- **Empty states** — Overview first-run, My Day, Tasks (3), Inbox zero, Brain Dump, Goals, Habits, Finance, Journal, Insights (thresholds), Weekly too-early, hidden module.


#### Open decisions · 8

- **Goal Milestone Path vs frozen Milestone Path** — Final package uses Goal Milestone Path for Goal detail; confirm the old v1 path is retired.
- **Shared 0–10 daily score** — Layered Area needs a derived score for mood (5 levels) and energy (3 levels). Proposed: mood ×2.5, energy ×5 → 0–10.
- **Work category colour** — Violet #7A62D6 (close to Teams indigo family). Keep or swap?
- **Inbox core** — Inbox treated as core (cannot be hidden). OK?
- **Mobile Today tab** — Overview and My Day merged under “Today” with a switch. OK, or separate tabs?
- **Insight auto-adjust** — “+50% duration” suggestions are opt-in; confirm wording/permission.
- **Rollover default** — Default “Ask me (Daily shutdown)”. Alternative: auto-move to tomorrow.
- **Weekly review day** — Thursday 18:00 default (end of Iranian work week).



---

## P01 · Personal Overview  
`boards/P01PersonalOverview.dc.html` · `screenshots/P01PersonalOverview.jpg` · dark: `P01PersonalOverviewDark`

#### Live slot states · 5

- **A · Morning (before first block)** — Morning · nothing planned · You have 6 tasks and 7h free. Plan them into your day? · Plan my day · Later
- **B · Live block (default)** — Now · UI design · My Day · Volt is used only here — the single live area of the page.
- **C · Free gap** — Free · 25m · Next: Client call at 16:30 · Fits: “Reply to Katy’s brief” · 20m · Do it now · Pick another
- **D · Evening → Shutdown suggestion** — After 18:00 · suggestion · You still have 3 unfinished tasks. Plan them before finishing your day? · Start · Later · Dismiss
- **E · First run (no data)** — First run · Start with My Day, Tasks and Calendar. · Goals, Habits, Finance, Journal and Insights are ready when you are. You can hide any of them in Settings. · Add first task · Take 3-step tour · Skip

#### Composition & rules

- **Read order (5–10 s)** — Greeting/date → Now card (volt) → Today progress ring → Up next → Tasks/Habits → Goals/Mood/Finance/Insight.
- **Changed from S1** — Mood card shows today + 7-day bars only (no reflection CTA duplicate). Habits card gains the compact Habit Streak Ribbon for the pinned habit. Finance shows budget vs expected marker. Assistant FAB removed (AI is out of scope).
- **Visualization budget** — Approved ring (Today progress) + one compact Streak Ribbon. No River, Terrain, Flow or Clock on Overview — they live in their module pages.
- **Volt** — Exactly one volt area: the Now card. Day strip uses a 12px volt “now” dot only.
- **Notch** — One notch: the Today hero (embedded “Open My Day”). Smaller cards are plain.
- **Hidden modules** — If Goals / Habits / Finance / Journal / Insights are hidden in Settings, their cards are removed and the bottom row re-flows (4 → 3 → 2 columns). Never shows a placeholder.
- **Card → destination** — Hero → My Day · Up next → My Day · Tasks → Tasks (Today) · Habits → Habits · Goals → Goals · Mood → Journal · Finance → Finance · Insight → Insights (the referenced pattern).
- **Inline actions** — Checking a task/habit is done in place (no navigation). Add task row opens Quick Add pre-filled for Today.


#### Motion

| Moment | Motion | Duration · easing | Reduced motion |
| --- | --- | --- | --- |
| Page enter | Cards fade + rise 8px, staggered 30ms; ring sweeps 0→64% | 320ms · ease-out | Fade only, ring static |
| Check task / habit | Checkbox fills, row text strikes through, counters tick | 180ms · ease-out | Instant state change |
| Now → next block | Now card cross-fades to the next block; progress resets | 400ms · ease-in-out | Swap |
| Evening suggestion | Now card slot morphs into Shutdown suggestion | 300ms | Swap |



---

## P02 · My Day  
`boards/P02MyDay.dc.html` · `screenshots/P02MyDay.jpg` · dark: `P02MyDayDark`

#### States · 6

- **Empty day** — Nothing planned yet · You have 7h free today and 5 tasks waiting. Start with your top 3 or pull from Unscheduled. · Pick top 3 · Add block
- **Overloaded day** — 09:00 · 10:00 · 11:00 · 12:00 · 13:00 · 14:00 · 15:00 · Deep work · 2h · Design review · overlaps 30m · Report · 1h 30m · Client prep · 1h 30m · Overloaded · 9h 40m of 8h · 1 overlap · Move 2 to tomorrow
- **Partially planned** — 09:00 · 10:00 · 11:00 · 12:00 · 13:00 · 14:00 · 15:00 · Deep work · 1h 30m · Lunch · 45m · 2h free · 3 tasks fit · Partially planned: free gaps show inline “fits” hints.
- **Current & completed blocks** — 11:00 · 12:00 · 13:00 · 14:00 · 15:00 · 16:00 · 17:00 · UI design · 35m left · Now · 14:35 · Morning email · done · Review · done · Current block: 2px mint outline + volt now-dot. Completed blocks: hatched + struck through.
- **Drag state** — 11:00 · 12:00 · 13:00 · 14:00 · 15:00 · 16:00 · 17:00 · Reply to Katy’s brief · Dragging · 20m → snaps 15m · Lunch · Drag: lifted card (shadow, −1° tilt), hatched ghost at snap target, 15-min snapping, auto-scroll at edges.
- **Reschedule** — Reschedule “Client prep” · Later today · 18:30 · free 1h · Tomorrow · 09:30 · best fit · Next working day · Sat · Fri is weekend · Pick date & time… · Back to Unscheduled · Same popover on desktop (from block ⋯ or right-click) and bottom sheet on mobile.

#### Rules

- **Job of the page** — ACTION. Plan and run today. No charts; capacity is a number + one bar.
- **Changed from S2** — Capacity is now a number + bar + “free” chip in the header. Notes card removed (Quick Note is global). Focus card becomes the single Pomodoro entry. Unscheduled list gets Today / Overdue / This week filter. Assistant FAB removed.
- **Drag & drop** — Unscheduled → timeline schedules; timeline → Unscheduled unschedules; edges resize (15m). Keyboard: Space lift, ↑↓ move 15m, Enter drop, Esc cancel.
- **Energy** — Header energy level re-orders Unscheduled suggestions (high-energy tasks suggested only into high-energy hours).
- **Capacity** — Planned = scheduled durations. >100% shows Overloaded chip + “Move N to tomorrow” (opens Reschedule pre-selected).
- **Focus entry** — Start focus uses the current block’s task. With no current block, it asks which task (sheet).
- **Volt** — Only the Now card + now-dot in the timeline line.
- **3 days view** — Same timeline, three columns (today + 2). For planning ahead without leaving My Day.


#### Motion

| Moment | Motion | Duration · easing | Reduced motion |
| --- | --- | --- | --- |
| Drop on timeline | Card shrinks into block; neighbours shift with spring | 240ms · spring(300, 28) | Instant place |
| Resize | Live height + duration label updates | follows pointer | — |
| Block completes | Block hatches, check pops | 200ms | Swap |
| Overload appears | Capacity bar turns rose, chip fades in | 200ms | Swap |



---

## P03 · Tasks · List  
`boards/P03TasksList.dc.html` · `screenshots/P03TasksList.jpg` · dark: `P03TasksListDark`

#### States · 6

- **Today · all done** — All done for today · 6 tasks completed · 3h 40m focused. Want to look at tomorrow? · Plan tomorrow · See completed
- **No tasks at all** — No tasks yet · Capture everything first — you can organise later. Try “Pay rent on 1 Aban !high”. · Add first task · Import
- **Filter · no result** — No tasks match · Nothing in Today with Area: Health + Energy: High. 4 matches in Upcoming. · Clear filters · Show Upcoming
- **Completed view** — Today · 6 · Deep work · Planner design · Planner side project · 2h · 09:00 · Water plants · Home · 5m · 10:30 · Yesterday · 8 · Weekly groceries · Home · 1h · Mon · Completed view: grouped by day, uncheck to restore. Kept 90 days, then archived.
- **Upcoming view** — Tomorrow · Wed 22 Mehr · 4 · 2h 50m · Review October expenses · Finance · Medium · 30m · 09:30 · Thu 23 Mehr · 2 · Renew car insurance · Home · Urgent · 15m · Thu · Fri 24 Mehr · weekend · 0 · Friday · Upcoming groups by date (Jalali); weekend headers in red; capacity per day on the right.
- **Complete + undo** — Undo after complete · “Pay electricity bill” completed · Undo · Completed rows stay 1.2s (struck), then collapse into the group’s “· N done” counter. Toast 5s.

#### List rules

- **Views** — Today (default) · Upcoming (by date) · All (by area) · Completed (by day). Badge counts are tasks, not hours.
- **Grouping** — Today: Overdue → Morning (<12) → Afternoon (12–17) → Evening (>17) → Unscheduled. Other groupings via “Group”: Date, Area, Priority, None.
- **Row anatomy** — Check · title · meta line (area dot, project/area, subtasks n/m, labels, recurrence icon) · priority · energy bars · duration · when. Rows are 52px; no cards in the list.
- **Inline edit** — Click title (or Enter) edits in place; chips for date, duration, energy, priority, repeat, area, labels. Open full Task Detail with Space or the row ⤢ on hover.
- **Sort** — Smart (overdue → time → priority → manual), Manual, Priority, Duration, Created.
- **Filters** — Area, Context, Priority, Energy, Labels, Has date, Recurring. Active filters show as removable mint chips under the toolbar.
- **Bulk** — Selection: hover circle → square checkbox, ⇧ range, ⌘ toggle, ⌘A group. Floating bulk bar: Schedule, Move (area/context), Priority, Complete, Delete. Esc clears.
- **Reorder** — Drag within a group = manual order. Drag to another time-of-day group sets a time window; to Unscheduled clears time.
- **Keyboard** — N new · / search · J/K move · X select · E edit · D date · 1–4 priority · ⌘↵ complete · B toggle Board.


#### Motion

| Moment | Motion | Duration · easing | Reduced motion |
| --- | --- | --- | --- |
| Complete | Check fills → strike → row collapses into counter | 180ms + 1.2s hold + 220ms | Instant collapse after 1.2s |
| Reorder | Lifted row, siblings slide | 200ms spring | Instant |
| List ↔ Board | Rows morph into cards (shared element on visible tasks), columns fade in | 320ms ease-in-out | Cross-fade |
| Bulk select | Checkboxes appear on all rows; bulk bar slides up 16px | 180ms | Appear |



---

## P03 · Tasks · Board  
`boards/P03TasksBoard.dc.html` · `screenshots/P03TasksBoard.jpg` · dark: `P03TasksBoardDark`

#### Grouping decision · 3

| Grouping | Columns | Drag means | When |
| --- | --- | --- | --- |
| Horizon (default) | Today · Tomorrow · This week · Later + Done rail | Reschedule (sets date; keeps time if it fits) | Planning ahead — the main reason a personal user opens a board |
| Time of day | Morning · Afternoon · Evening · Unscheduled (+ Done) | Sets time window for today | Arranging today when My Day timeline is too precise |
| Status | To do · Planned (has time) · Done | Plan / unplan / complete | Users who think in states |


#### Board rules

- **Why not Kanban** — Personal work has no workflow stages. Columns are time horizons so dragging = deciding when.
- **Column header** — Title · count · duration sum · capacity bar (Today/Tomorrow only, against free hours from Calendar).
- **Overdue** — Pinned rose strip at the top of Today with “Reschedule” (opens Reschedule with all overdue selected). Overdue cards keep a rose outline.
- **Done rail** — Narrow vertical rail. Drop to complete; click to expand into a column of today’s completed cards.
- **Cards** — Same data as list rows; no notches; 20px radius; selected = mint outline + square check.
- **Drag** — Lifted card −2°, ghost slot hatched mint; cross-column auto-scroll; Tomorrow on Friday skips to Saturday (weekend rule from Settings).
- **Filters** — Shared with List; view tabs are replaced by Group-by. “Show done” toggles the Done column contents.
- **Mobile** — Columns become horizontal snap pages with a column pager; drag across edges switches page. Long-press for select.


#### States · 3

- **Empty column** — This week · Nothing this week · Drag from Later or add one
- **Overloaded column** — Tomorrow · 9h 10m / 7h · Overloaded · move 2h 10m
- **Filter result** — Later · 2 of 11 match · filters on · Learn Figma variables · Learning · 3h

#### Motion

| Moment | Motion | Duration · easing | Reduced motion |
| --- | --- | --- | --- |
| Drop in column | Card settles, column totals tick, capacity bar animates | 240ms spring | Instant |
| Drop on Done | Card shrinks into rail, counter +1, undo toast | 220ms | Instant + toast |



---

## P04 · Calendar  
`boards/P04Calendar.dc.html` · `screenshots/P04Calendar.jpg` · dark: `P04CalendarDark`

#### Month & Agenda views · 2

· Sep–Oct 2026

Week

Month

Agenda

Sat

Sun

Mon

Tue

Wed

Thu

Fri

Gym

Mehr payroll

Release v2.3

Dentist

Gym

Sprint planning

UI design

Gym

Review expenses

Retro

Rent

Agenda · next 14 days

Week

Month

Agenda

Today · Tue 21 Mehr

13 Oct

14:00

16:00

UI design · My Day

Personal · task

16:30

17:00

Client call

Projects · Website redesign

17:15

18:15

Gym

Personal

Wed 22 Mehr

14 Oct

09:30

10:00

Review October expenses

Personal · task

11:00

12:00

Quarterly review

Companies · Araxitis

Fri 24 Mehr · weekend

16 Oct

09:00

11:00

Hike · Darband

Personal


#### Calendar rules · supersedes S7

- **Preserved from S7** — Week view grid, scope layer chips with counts, selected-event panel (notched, scope-tinted), mini month, Unscheduled tray, Shamsi/Gregorian switch, Friday weekend column tint.
- **Refined** — New Personal rail (11 + Settings). Assistant FAB removed. “+ New” opens Universal Quick Add pre-filled with the clicked slot. Event chips get ≥28px hit area; columns min 96px, below that the week view switches to 3-day.
- **Month view** — Day cells show max 2 chips + “+N”. Click day → Agenda for that day in the side panel; double-click → create. Jalali number large, Gregorian small (swaps with the setting).
- **Agenda view** — Chronological list for 14 days, weekend days in red, Personal tasks with time appear as rows with “task” meta and a checkbox on hover.
- **Scope layers** — Personal always on. Projects/Teams/Companies layers are read-only context here (from the shell) — editing opens their own module. Hidden layers persist per user.
- **Unscheduled tray** — Same list as My Day Unscheduled. Drag to a day (Month) sets date without time; to a slot (Week) sets date + time.
- **Drag & drop** — Personal events/tasks: move, resize (15m), drag to another day. Other scopes: drag disabled with tooltip “Managed in Projects”.
- **Selected event** — Panel actions: Start focus (task only), Mark done, Reschedule, Open detail. Esc closes.
- **Empty** — Week with no events shows faint “Free week · 40h free” in the grid and the Unscheduled tray emphasised.



---

## P05 · Task Create  
`boards/P05TaskCreate.dc.html` · `screenshots/P05TaskCreate.jpg` · dark: `P05TaskCreateDark`

#### Progressive disclosure & Done · 2

- **Details · default (More options collapsed)** — Task · Event · Reminder · Review October expenses · ● Personal · Tomorrow · 09:30 · 30m · High · Low energy · More options · Repeat · Subtasks · Notes · Reminder · Area · Labels · Linked goal · Dependencies · Cancel · Create task · ⌘↵
- **Step 4 · Done** — Added to Wed 22 Mehr · 09:30 · Personal · 30m · High · Low energy · Create another · Open task · Back to My Day · Step 4 “Done”: shown 2.5s, then returns to where creation started (unless “Create another”).

#### Task Create rules · supersedes S8

- **Entry points** — Fast path = Universal Quick Add (P18 · H): one line, parsed, Enter saves. “Add details” (or ⌘N twice) opens this full Task Create page with the parsed values.
- **Flow kept** — Capture → Details → Schedule → Done. Steps are anchors on one page, not separate routes; the stepper reflects scroll + completion.
- **Progressive disclosure (new)** — Details shows Title, Context, Date, Estimate, Priority, Energy only. Repeat, Subtasks, Notes, Reminder, Area, Labels, Linked goal and Dependencies live under “More options” (remembered open/closed per user).
- **Parsing tokens** — Dates (tomorrow, Sat, 22 Mehr, 1 Aban), time (10:00, 6pm), #area, !priority, ~duration, @context, every … for repeat. Parsed chips are editable; Persian equivalents (فردا، شنبه، ساعت ۱۰).
- **Schedule panel** — Free-slot suggestions ranked by energy match + gap fit; “Keep unscheduled” is always available. Weekend (Fri) suggestions only if the user works weekends.
- **Context** — Personal is default. Choosing another context keeps the same form; Personal-only fields (Energy) stay.
- **Mobile** — Quick Add sheet with chips row; “Details” expands the sheet to full height (same fields, same disclosure).
- **Changed from S8** — Assistant FAB removed; rail updated; More options collapse added; Done step defined.



---

## P06 · Task Detail  
`boards/P06TaskDetail.dc.html` · `screenshots/P06TaskDetail.jpg` · dark: `P06TaskDetailDark`

#### States · 5

- **Completed** — Completed · 15:42 · Drawer stays open 1.2s, then closes. Undo in toast. · “UI design · My Day screen” completed · Undo
- **Recurring completed** — Recurring task completed · “Weekly groceries” repeats every Monday. · Next: Mon 27 Mehr · 18:00 · Change · Only this occurrence is marked done; the next one is created automatically.
- **Dependency warning** — Blocked · Blocked by 1 · “Sketch progress hero” is not done · Complete anyway · Personal tasks never hard-block; this is a soft warning.
- **Delete confirm** — Delete task? · “UI design · My Day screen” and its 5 subtasks. You can undo for 10 seconds. · Delete · Cancel
- **Loading** — Loading: skeleton matches layout; never a spinner over the whole drawer.

#### Rules

- **Container** — Desktop: right drawer 520px over the current page (Tasks, My Day, Calendar, Board). Scrim 28%. URL keeps the task id so it is linkable. Mobile: full-screen view with back.
- **Head (signature)** — Sculpted corner holds the ONE primary action: Complete. Secondary: Start focus (volt only because it begins a live session), Reschedule, Move, ⋯ (Duplicate, Convert to event, Delete).
- **Properties** — Inline-editable rows: Schedule, Duration, Energy, Priority, Linked goal, Area · labels, Repeat (in chip). Click a value → popover editor, never a form.
- **Folder tabs** — Subtasks · Notes · Activity · Links (dependencies + files/URLs). Tabs with no content are hidden except Subtasks and Notes. Comments only appear for tasks shared from another context (Projects/Teams); Personal uses Notes.
- **Changed from S3** — S3 was a Projects task. Personal detail drops assignee/status workflow, adds Energy, Linked goal, Repeat, Start focus. Bottom tab bar replaced with folder tabs attached to the panel.
- **Keyboard** — Esc close · ⌘↵ complete · F start focus · D date · Space open/close from list.
- **Navigation** — ↑/↓ in the list behind updates the drawer (no close/reopen).


#### Motion

| Moment | Motion | Duration · easing | Reduced motion |
| --- | --- | --- | --- |
| Open | Drawer slides from right 24px + fade; scrim fades | 260ms ease-out | Fade |
| Complete | Notch button fills, title strikes, drawer closes after 1.2s | 200ms + 1.2s | Instant |
| Tab switch | Panel content cross-fades; active tab background slides | 180ms | Swap |



---

## P07 · Inbox  
`boards/P07Inbox.dc.html` · `screenshots/P07Inbox.jpg` · dark: `P07InboxDark`

#### States · 5

- **Empty · inbox zero** — Inbox zero · Everything captured has a home. New captures from Quick Add, voice and share sheet land here. · Open Brain Dump
- **Snooze popover** — Snooze until · This evening · 18:00 · Tomorrow morning · Wed 09:00 · Next working day · Sat 09:00 · Next week · Sat 25 Mehr · Pick date…
- **After convert** — Converted to task · Added to Thu 23 Mehr · 15m · Undo · Item leaves the list (slides left), next item opens in the process card. Converted items keep a link “from Inbox” in Activity.
- **Process mode finished** — Processed 6 items · 4 tasks · 1 event · 1 archived. Nice and light. · Back to My Day · Review tasks
- **Error · transcription** — Voice item failed to transcribe · Recording 08:30 · 22s · Retry · Audio is kept only until a transcript succeeds or the user drops it.

#### Rules

- **Purpose** — Inbox = captured items waiting for a decision. Lighter than Tasks: no priority/duration columns, one line + source.
- **Sources** — Quick Add without a date, Voice capture transcripts, share sheet URLs, notes, reminder ideas, event ideas, items moved from Brain Dump.
- **Destinations** — Task · Event · Note · Journal · Reminder · Brain Dump · Snooze · Archive · Drop. Suggested destination is pre-selected from parsing (date → Task/Event, URL → read later note).
- **Two modes** — Triage list (row hover actions, multi-select) and the Process card on the right that walks items one by one (1 of N). Both always visible on desktop; on mobile the Process card is a swipe stack.
- **Bulk** — Select → To tasks (each keeps parsed date), Snooze, Archive. No bulk “convert to event”.
- **Snooze** — Item hides and returns to top of Inbox at the chosen time with a “back from snooze” tag. Snoozed tab lists them.
- **Rail badge** — Rail and mobile More show the count of untriaged items (not snoozed).
- **Keyboard** — T E N J R B destinations · S snooze · A archive · ⌫ drop · ↵ accept suggestion · → skip.
- **Signature** — Process card = signature with empty notch (it is the one object you act on).


#### Motion

| Moment | Motion | Duration · easing | Reduced motion |
| --- | --- | --- | --- |
| Triage | Item lifts, flies toward destination (left list), next item slides in | 260ms | Swap |
| Archive | Row collapses height, toast | 200ms | Instant |
| Convert | Chip summary morphs into toast | 220ms | Toast only |



---

## P08 · Brain Dump  
`boards/P08BrainDump.dc.html` · `screenshots/P08BrainDump.jpg` · dark: `P08BrainDumpDark`

#### States & decision · 4

- **Empty page** — Tuesday · 21 Mehr · What’s on your mind? · Empty page: the cursor is already in the text. No buttons until something is written.
- **Convert popover** — Convert line → Task · Birthday gift for Sara — ceramics · ● Personal · Before 2 Aban · 30m · Create task · Cancel · Mini popover anchored to the line, pre-filled by parsing. The line stays, tagged “→ Task”.
- **Clear page** — Clear page · 3 sorted lines will be archived. 5 unsorted lines: · Move unsorted to Inbox · Keep them on this page · Archive everything
- **Model evaluation** — Model decision · Continuous page ✓ · Quick entries · Start writing · 0 clicks · 1 click / entry · Thinking flow · Free, paragraphs · Fragmented · Sorting · Per line / selection · Per card · Chosen: continuous daily page with line-level sorting. Feels like paper, not a task editor.

#### Rules

- **Zero friction** — Opening Brain Dump puts the cursor in today’s page. No title, type, date, context or destination fields — ever.
- **Auto-save** — Saves on every pause (600ms). Status chip “Saving… / Saved · time / Offline · will sync”.
- **Sorting** — Hover a line or select text → action row: Task · Note · Journal · Event · Inbox · Strike. Sorted lines stay visible, muted, with a “→ destination” tag (click opens it).
- **Brain Dump vs Inbox** — Inbox = discrete captures awaiting a decision. Brain Dump = free thinking. “Send rest to Inbox” turns each unsorted line into an Inbox item.
- **Pages** — One page per day (new page at 04:00). Left list shows unsorted counts. Old pages never nag.
- **Typography** — 19px / 1.5 body, generous margins, no rich-text toolbar (Markdown shortcuts only: - list, [] checkbox).
- **Signature** — The page is a signature sheet with an empty sculpted corner — the only decoration on the screen.
- **Privacy** — Covered by the Journal lock setting if enabled (same sensitivity).


#### Motion

| Moment | Motion | Duration · easing | Reduced motion |
| --- | --- | --- | --- |
| Auto-save | Status chip text cross-fades; no spinner | 150ms | Same |
| Convert | Line tints mint, tag pops in; toast with Undo | 200ms | Tag appears |
| Clear | Sorted lines fade and collapse upward | 240ms | Remove |



---

## P09 · Focus  
`boards/P09Focus.dc.html` · `screenshots/P09Focus.jpg` · dark: `P09FocusDark`

#### States · 5

- **Paused** — Paused · 2m · 18:24 · Paused timer turns soft mint (not volt) — live state is suspended. · Resume
- **Long break** — LONG BREAK · AFTER 4 CYCLES · 14:50 · Long break adds a walk suggestion and shows today’s focus total: 1h 40m. · Skip · End focus
- **Session complete** — Session complete · 4 cycles · 1h 40m · 2 distractions parked · Task “UI design” → still open (4 of 5 subtasks) · Mark task done · Another round · Back to My Day
- **Focus settings** — Focus settings (sheet) · Focus · 25 · 45 · 50 · 90 · Short break · 5 · 10 · Long break · 15 · 20 · 30 · Cycles · 2 · 3 · 4 · 6 · Same values as Settings › Focus; changing here asks “Save as default?”.
- **No task chosen** — Start without a task · Focus started from rail/Quick Add with no current block: · What will you focus on? · Review October expenses · 30m · Reply to Katy’s brief · 20m · Just a timer

#### Rules

- **Signature** — Full-screen mode. Rail and command bar retreat: replaced by Leave focus, cycle capsule and notification status. Only the timer card is signature (notch holds Pause).
- **Hierarchy** — Task title and timer dominate. Linear session bar, not a ring — rings stay reserved for Today progress and Habit ring card. No analytics, finance, goals or widgets.
- **Volt** — Volt = running timer digits + session bar + current cycle dot. Paused and Break use no volt.
- **Actions** — Pause/Resume (notch) · Finish task (completes + ends session) · Finish session (keeps task open) · +5 min. Break: Skip break · +1 min · Next cycle auto-starts if setting on.
- **Side panels** — Quick note (saved to task Notes) and Park a distraction (to Inbox). Both quiet, translucent, collapsible.
- **Break** — Distinct, calmer world: airy blue surface, breathing circle, no task details, suggestions chips. Long break after N cycles.
- **Not here** — Focus Clock visualization belongs to Insights only.
- **Leaving** — Leave focus keeps the timer in the command bar schedule island (volt dot) and in My Day Focus card.
- **Mobile** — Same screen full-bleed; side panels become two buttons opening sheets. Lock-screen/live notification shows remaining time.


#### Motion

| Moment | Motion | Duration · easing | Reduced motion |
| --- | --- | --- | --- |
| Enter focus | Shell fades out, timer card scales 0.98→1 | 360ms ease-out | Fade |
| Tick | Digits change without animation; bar grows continuously | linear | Same |
| Focus → Break | Mint card cross-fades to airy break surface; breathing circle starts 4-4 rhythm | 600ms | Static circle, no breathing |
| Finish session | Timer collapses into summary card | 320ms | Swap |



---

## P10 · Daily Shutdown  
`boards/P10Shutdown.dc.html` · `screenshots/P10Shutdown.jpg` · dark: `P10ShutdownDark`

#### States · 6

- **Trigger (suggested, optional)** — You still have 5 unfinished tasks · Want to plan them before finishing your day? · Start · Later · 1h · Dismiss · Trigger: after last block or at work-hours end + 30m (Settings › Planning). Max once a day. Also shown as Overview evening card and mobile notification.
- **Nothing to route** — Nothing left to route · All 12 planned tasks done. Arrange tomorrow or just finish. · Arrange tomorrow · Finish day
- **Capacity · tomorrow overloaded** — Tomorrow is full · 8h 20m planned · 1h 20m over your 7h · Suggest: move “Plan weekend trip” (1h) to Saturday · move “Sort photos” to This week · Apply suggestion · Keep
- **Undo** — 2 tasks moved to Tomorrow · Undo · Each routing action gives a 10s undo; Finish day commits all.
- **Finished** — Day closed · 12 done · 4 to tomorrow · 1 dropped · mood Good saved to Journal · Tomorrow starts 09:00 · Finish finance report
- **Repeat-move hint** — Repeat offender · “Sort photo backups” moved 3 times. Suggest Drop or This week? Shown as a rose hint on the row (“3rd time moved”).

#### Rules

- **Optional** — Never forced. Trigger offers Start / Later / Dismiss. Also reachable from My Day ⋯ and Overview evening card. Not in navigation.
- **Step 1 · Route** — Every unfinished task gets a destination chip: Tomorrow (default for scheduled today) · Next working day · Pick date · This week · Inbox · Keep unscheduled · Drop. Multi-select + bulk bar; “Send all to” row for one-tap.
- **Step 2 · Tomorrow** — Tasks routed to Tomorrow appear in the Tomorrow card. Drag into hour slots; Auto-arrange fills by energy + free gaps from Calendar. Capacity bar against work hours.
- **Step 3 · Reflect** — Mood (5 levels), energy (3), what went well, optional note. Saved as today’s Journal entry (no separate Reflection domain).
- **Carry-over Flow** — Refined daily variant at the top explains today’s outcome; Tomorrow outcome is emphasised (approved). It updates live as tasks are routed.
- **Steps on desktop** — All three visible at once; the segmented stepper only scrolls/highlights. On mobile it is a 3-step sheet flow.
- **Signature** — Tomorrow card = signature (notch opens tomorrow in My Day). The page’s primary action “Finish day” sits bottom-right.
- **Weekend** — Tomorrow on Thursday evening → “Next working day” = Saturday, Friday shown red and skipped unless user works Fridays.


#### Motion

| Moment | Motion | Duration · easing | Reduced motion |
| --- | --- | --- | --- |
| Task routing | Row slides toward its destination; Carry-over Flow stream widths re-flow | 260ms | Swap |
| Tomorrow scheduling | Chip lands into hour slot, capacity bar grows | 220ms spring | Instant |
| Finish day | Page dims to “Day closed” card; command bar island switches to tomorrow | 500ms | Fade |



---

## P11 · Goals  
`boards/P11Goals.dc.html` · `screenshots/P11Goals.jpg` · dark: `P11GoalsDark`

#### States · 4

- **Empty** — No goals yet · Goals connect tasks and habits to something bigger. Start with one for this season. · Create a goal · See examples
- **Simple goal** — Simple goal (no milestones) · Run 100 km this month · 41 · of 100 km · 18 days left · Goals without milestones show a number + bar in detail; no path is drawn (no fake journey).
- **Delayed** — Delayed · Behind · 3 days · Emergency fund · The current milestone turns amber in the path (approved Delayed state). Suggested: “Add 2M transfer on 1 Aban”. · Adjust deadline
- **Completed** — Completed · 100% · Path fully drawn, goal flag filled. Card moves to Completed after 3 days with a “Reflect in Journal” link.

#### Rules

- **Hierarchy** — List = product cards (number + one bar). Selected goal = one FolderTabs object with a sculpted corner holding Edit. Progress appears once as a number in the head and once as the path.
- **Journey tab** — Goal Milestone Path (approved, frozen) is the primary story. Selected node shows due date + next action (approved). Below: next milestone card with “Plan next step” (creates a task linked to the milestone).
- **Key results** — Optional numeric KRs with plain bars. If a goal has KRs but no milestones, Key results becomes the default tab.
- **Linked** — Tasks (open first), Habits with streak chip, optional financial target bar (amber = Finance category colour).
- **Creation** — New goal opens the Goal sheet (P18 · C): title, context, target, deadline, optional milestones. Milestones can be added later from the path (+ between nodes).
- **Ring** — No ring on Goals (S11 ring removed): a ring next to a path repeated progress.
- **Changed from S11** — Replaces the old milestone visual with Goal Milestone Path; list simplified; folder tabs replace stacked sections (less scroll).


#### Motion

| Moment | Motion | Duration · easing | Reduced motion |
| --- | --- | --- | --- |
| Select goal | Detail cross-fades; path draws done segment | 400ms ease-out | Static path |
| Milestone done | Next segment draws, node fills, halo moves | 500ms | Swap |
| Tab switch | Panel cross-fade | 180ms | Swap |



---

## P12 · Habits  
`boards/P12Habits.dc.html` · `screenshots/P12Habits.jpg` · dark: `P12HabitsDark`

#### States · 4

- **Empty** — No habits yet · Start with one small thing you want to do most days. You can add a target and reminder later. · Create a habit · Ideas
- **Sparse** — First week (sparse) · Habit Field shows only the days since the habit started; earlier columns are hidden, not grey. Ring hidden until 7 days of data.
- **Cell states** — Cell states (from approved Habit Field) · Complete · Missed · Skipped · Rest · Today · Future
- **Completion** — Streak continued · Read 20 pages · 8-day streak · Undo · Ribbon adds today’s node with a short draw; flame ticks up.

#### Rules

- **Job** — Track → understand → continue. Today row first (fast check-in), then consistency, then one selected habit.
- **Today row** — Product-card family (no notches). Tap = complete; long-press = skip / rest / log amount. Rest days (schedule) show a moon.
- **Habit Field** — Approved, frozen: all habits × 14 days (Month/Year switch to wider periods with same cells). Click row name selects the habit.
- **Selected habit** — Head card is signature (notch = Check today). Habit Streak Ribbon below. Ring card with bottom tabs History / Details (approved RingCard pattern).
- **Ring** — Ring allowed here: approved RingCard precedent for a single habit’s monthly completion.
- **No analytics** — Correlations (e.g. “Read → better mood”) live in Insights, not here.
- **Create / edit** — Habit sheet (P18 · B): name, icon, frequency, target, preferred time, reminder.
- **Changed from S9** — Habit Field + Streak Ribbon replace the previous grid widgets; selection pattern added; less scroll.


#### Motion

| Moment | Motion | Duration · easing | Reduced motion |
| --- | --- | --- | --- |
| Complete | Tile tints mint, check pops; Field cell fills; ribbon extends | 220ms | Instant |
| Streak continues | Flame count ticks, new ribbon node draws | 300ms | Swap |
| Period switch | Cells fade/scale into new grid | 240ms | Swap |



---

## P13 · Finance  
`boards/P13Finance.dc.html` · `screenshots/P13Finance.jpg` · dark: `P13FinanceDark`

#### States · 4

- **Empty** — No transactions yet · Add your first expense or set a monthly budget. Amounts in Toman (switch to Rial anytime). · Add expense · Set budget
- **Sparse** — Sparse month (< 5 transactions) · Trends and Breakdown tabs show the numbers list instead of River/Flow, with a note “Charts appear after a few more entries”. No fake shapes.
- **Rial** — Rial · 1,864,000,000 · Rial · Same numbers ×10. Compact form in charts: 1.86B / ۱٫۸۶ میلیارد. Persian digits follow the setting.
- **Locked** — Finance is locked · PIN / biometric (Settings › Privacy). Overview card shows “Locked” without amounts. · Unlock

#### Rules

- **Hierarchy** — One Finance object with FolderTabs: Overview (fast answers) · Trends (Budget River) · Breakdown (Budget Flow) · Transactions. River and Flow never share a screen.
- **Overview** — Balance summary = signature card (notch = Add expense). KPI family below (no notches). Budget vs actual bars per category (over-budget gets a rose end marker). Upcoming payments and recent transactions.
- **Trends** — Budget River answers “how did spending move over time?”. Period: This month / 3 months. One sentence observation under the chart.
- **Breakdown** — Budget Flow answers “where is the money going?” Income → categories → Remaining (dashed). Spent total is neutral, never red.
- **Add expense** — Sheet (P18 · A): amount keypad first, category chips, date (today), note. Opened from header button, notch, Quick Add (“250k lunch #food”).
- **Currency** — Toman default; Rial switch converts display only. Category colours = validated categorical palette (Housing coral · Food green · Transport blue · Lifestyle pink · Work violet · Health amber · Other grey).
- **Changed from S10** — Tabs replace the long stacked page; River moved to Trends; Flow added as Breakdown; summary becomes signature.


#### Motion

| Moment | Motion | Duration · easing | Reduced motion |
| --- | --- | --- | --- |
| Tab switch | Panel cross-fade; River/Flow paths draw from left/source | 400ms | Static |
| Period change | Streams morph between months (d-path) | 450ms ease-in-out | Swap |
| Inspect | Hover dims others to 30%, tooltip island | 120ms | Same |



---

## P14 · Journal  
`boards/P14Journal.dc.html` · `screenshots/P14Journal.jpg` · dark: `P14JournalDark`

#### States · 4

- **Empty** — No entries yet · A few lines a day is enough. Your mood and energy check-ins from Overview and Shutdown also land here. · Write today’s entry
- **Sparse trend** — Fewer than 3 days of mood data · The terrain card is replaced by a row of mood dots for the days you have, plus “Your mood trend appears after 3 check-ins”. No invented terrain.
- **Locked** — Journal is locked · Enter PIN or use biometrics
- **Check-in only entry** — Mood check-in only · Logged from Overview (no text): appears as a slim entry “Good · Medium energy · 09:10”, expandable to write.

#### Rules

- **Writing first** — Today’s entry composer takes the main column; cursor ready. Mood (5) · Energy (3) · tags · What went well · Reflection. Auto-save.
- **One trend visual** — Mood Terrain (refined, approved) in compact form, last 7 days. Layered Area stays in Insights so the two never sit side by side.
- **Sources** — Daily Shutdown reflection, Mood check-in (P18 · D), Brain Dump line → Journal, Inbox → Journal all write into the day’s entry.
- **Signature** — Composer = signature sheet with empty sculpted corner. Entries list = product cards.
- **Privacy** — Journal lock (PIN / biometric placeholder) hides content in Overview, search and notifications.
- **Changed from S12** — Composer promoted; analytics reduced to one terrain card; mood scale aligned to 5 levels, energy to 3.


#### Motion

| Moment | Motion | Duration · easing | Reduced motion |
| --- | --- | --- | --- |
| Mood pick | Selected pill fills, terrain today-point rises | 200ms | Instant |
| Auto-save | Saved label fades | 150ms | Same |
| Open entry | Entry card expands into composer | 260ms | Swap |



---

## P15 · Insights  
`boards/P15Insights.dc.html` · `screenshots/P15Insights.jpg` · dark: `P15InsightsDark`

#### States · 4

- **No data** — Not enough data yet · Insights appear after about 2 weeks of using My Day, Focus and check-ins. We never show patterns from too little data. · What do we look at?
- **Partial data** — Collecting · 6 of 14 days · Each tab shows its own threshold: Focus needs 10 sessions, Signals 14 check-ins, Estimates 15 completed tasks with estimates.
- **Loading** — Loading: skeleton per tab; charts fade in when ready.
- **Error (per tab)** — Couldn’t calculate · Something went wrong with this pattern. Other tabs still work. · Retry

#### Rules

- **Primary analytical surface** — All rich Personal DataViz lives here (except Finance charts and Habit Field). Every chart answers a written question and ends in an observation sentence.
- **Hierarchy** — Headline insight (signature, empty notch) → observation family (3 product cards, no notches) → FolderTabs object with one visualization per tab.
- **Tabs** — Focus = Focus Clock (refined) · Time = Context Ribbon · Signals = Layered Area · Estimates = simple bars · Habits ↔ mood = simple paired bars. Only one large visualization visible at a time.
- **Terrain vs Layered** — Mood Terrain lives in Journal; Layered Area here. They never appear together.
- **Actions** — Insights can propose one action (Protect 09–12, +50% duration). Actions are opt-in; nothing changes automatically.
- **Thresholds** — No chart without enough data; partial state shows progress to the threshold.
- **Changed from S13** — Folder tabs instead of a long dashboard; Focus Clock refined version; Layered Area added; Mood Terrain moved to Journal.


#### Motion

| Moment | Motion | Duration · easing | Reduced motion |
| --- | --- | --- | --- |
| Period change | Visual morphs (d-path / wedge length) | 450ms ease-in-out | Swap |
| Metric switch (Signals) | Emphasised layer moves to top; others fade to 12% | 300ms | Swap |
| Tab switch | Panel cross-fade | 180ms | Swap |



---

## P16 · Weekly Review  
`boards/P16WeeklyReview.dc.html` · `screenshots/P16WeeklyReview.jpg` · dark: `P16WeeklyReviewDark`

#### Steps & states · 6

- **Step 1** — 1 · Wins · Auto-suggested from completed tasks, milestones and streaks; user picks up to 5 and can add their own.
- **Step 3** — 3 · Goals · Each active goal: progress delta this week (number + bar), next milestone, “On track / Delayed”. Tap opens Goal detail. No path here.
- **Step 4** — 4 · Plan · Choose 3 priorities for next week; drag carry-over tasks onto days (mini week strip with capacity per day; Friday red).
- **Step 5** — 5 · Reflect · What went well · what slipped · one thing to change. Saved as a Journal entry tagged #weekly.
- **Empty / too early** — Not enough week yet · Weekly Review unlocks after 3 days of planning. Your first review will be on Thursday.
- **Trigger** — Trigger · Suggested Thursday 18:00 (end of Iranian work week, Settings › Notifications). Opens from Overview card or notification. Not in navigation.

#### Rules

- **Flow** — Wins → Carry over → Goals → Plan → Reflect. Segmented stepper (wizard steps never use folder tabs). Save & exit keeps progress.
- **Weekly Story** — Approved signature summary at the top of every step; now with the empty sculpted corner. Entrance plays once per review.
- **Carry-over Flow** — Weekly variant: Completed dominant (approved). Unfinished tasks get the same route chips as Daily Shutdown (shared RouteChip component).
- **Not overcrowded** — Habits and mood appear as two numbers only. No Terrain, Clock or Ribbon here.
- **Outcome** — User leaves knowing: what went well (Wins), what moved (Goals), what slipped and where it went (Carry over), what matters next (Plan priorities).
- **Changed from S14** — Steps condensed; Weekly Story + refined Carry-over Flow; route chips unified with Shutdown.


#### Motion

| Moment | Motion | Duration · easing | Reduced motion |
| --- | --- | --- | --- |
| Weekly Story entrance | Hills rise in 3 layers, headline fades, metrics count up | 900ms total, once | Static |
| Step transition | Content slides 24px + fade; stepper pill moves | 280ms | Swap |
| Routing | Same as Shutdown | 260ms | Swap |



---

## P17 · Settings  
`boards/P17Settings.dc.html` · `screenshots/P17Settings.jpg` · dark: `P17SettingsDark`

#### Rules

- **Structure** — One Settings page with an in-page index (not 15 routes). Groups are utility cards; value rows open a popover (desktop) or nested sheet (mobile).
- **Modules** — All optional modules on by default. Hidden module: removed from rail, mobile More, Overview cards, Quick Add destinations and search; deep links show “Module hidden · Turn on”. Core (Overview, My Day, Tasks, Calendar, Inbox) cannot be hidden.
- **Language** — Switching to فارسی flips layout to RTL immediately, digits follow the Digits setting independently.
- **Calendar** — Shamsi/Gregorian swaps primary/secondary date everywhere. Week start Saturday and weekend Friday are defaults for Iran; editable.
- **Rollover** — “Unfinished tasks at day end”: Ask me (Daily shutdown, default) · Move to tomorrow automatically · Keep where they are.
- **Geometry** — Settings never use notches or folder tabs (utility surface).
- **Mobile** — Index becomes the Settings root list; each group opens as a pushed panel with back.


#### States · 3

- **Hidden module deep link** — Finance is hidden · You hid Finance in Settings. Your data is still here. · Turn Finance on
- **Delete account** — Delete account? · This permanently removes tasks, journal and finance data after 14 days. Export first? · Type DELETE to confirm · Delete · Export first
- **Saved** — Settings saved · Undo · Every change saves instantly; destructive ones confirm.


---

## P18 · Supporting Flows  
`boards/P18SupportingFlows.dc.html` · `screenshots/P18SupportingFlows.jpg` · dark: `P18SupportingFlowsDark`

#### Sheets A–F · 6

A · Add expense

Sheet

1,240,000

Toman · = 12,400,000 Rial

Food

Housing

Transport

Lifestyle

Work

Health

Other

+ note

000

Save expense

B · New habit

Drawer · 420px

Read 20 pages

Frequency

Daily

Weekdays

3× a week

Custom

Target

20 pages

Time

Evening

Reminder 20:00 if not done

Cancel

Create habit

C · New goal

Drawer · 420px

Launch Planner v1

● Personal

Target: 40 beta users

Milestones (optional)

Design

30 Mehr

Development

15 Aban

Beta

20 Aban

+ Add milestone

Link tasks, habits or a money target after creating.

Cancel

Create goal

D · Mood check-in

Popover

How are you feeling?

Rough

Low

Okay

Good

Great

Energy

Low

Medium

High

Add a word… (optional)

Saved to today’s Journal entry · 2 taps minimum

Save

E · Reschedule

Popover

Later today

18:30 · fits

Tomorrow

Wed 09:30 · best fit

Next working day

Sat

This week

Sat–Thu

Pick date & time…

Unschedule

Shared component for My Day, Tasks, Calendar, Shutdown, Weekly Review.

F · Quick note

Floating panel · ⌘⇧N

Save as note

→ Inbox

→ Brain Dump

Save


#### Voice capture · 5 states

Voice capture (G) · desktop floating panel, mobile bottom sheet. Output is a transcript — there is no audio library.

**RECORDING · 00:14**

Live words appear here as you talk…

Pause

Cancel

**PAUSED · 00:14**

Tap resume to continue the same note

Resume

Done

**TRANSCRIBING**

Usually 2–5 seconds. You can close this; the result goes to Inbox.

**TRANSCRIPT READY**

Edit text before converting

Convert to

Task · Thu

Note

Journal

Event

Create task

Send to Inbox

**COULDN’T TRANSCRIBE**

No connection or audio too quiet.

The recording is kept only until it is transcribed or dropped.

Retry

Send to Inbox later

Drop


#### Universal Quick Add

tomorrow 10:00

#finance

!high

~30m

UNDERSTOOD AS

Finance · Personal

High

30 min

Task

Event

Note

Expense

Inbox

↵ save · ⇥ Add details (opens Task Create)

- **Universal Quick Add (H)** — ⌘K → +, command-bar +, mobile centre FAB, rail-less pages too. One line, parsed live, Enter saves to the chosen type. Without a date a task goes to Today’s Unscheduled; without a type → Inbox.
- **Types** — Task (default) · Event · Note · Expense (opens amount keypad) · Inbox. Persian tokens: فردا، ساعت ۱۰، #مالی، !مهم
- **Escalation** — Tab = Add details → full Task Create page with parsed values.


#### Rules

- **Container rule** — Desktop: drawer (right, 420px) for multi-field create/edit (Habit, Goal) · popover for one-decision flows (Mood, Reschedule) · centred sheet for Add expense & Quick Add · floating panel for Quick note and Voice. Mobile: all are bottom sheets.
- **No full pages** — Only Task Create keeps its established full page (rich scheduling panel). Goal creation stays a drawer: milestones are optional and editable on the path later.
- **Edit = Create** — Same component opens pre-filled for edit; destructive actions only in edit.
- **Geometry** — Panels are product surfaces (32px radius, no notch). The only signature here is none — flows are transient.
- **After action** — Every save closes the panel, shows a toast with Undo and highlights the new item where it landed.



---

## PM01 · Mobile core  
`boards/PM01MobileCore.dc.html` · `screenshots/PM01MobileCore.jpg` · dark: `PM01MobileCoreDark`

#### Mobile rules

- **Bottom nav** — Today · Tasks · (+) · Calendar · More. Today holds Overview and Plan (My Day) as a segmented switch — both answer “what about today?”. More opens a sheet with Goals, Habits, Finance, Journal, Insights, Inbox (badge), Brain Dump, Settings + contextual flows (Finish day, Weekly review).
- **Centre +** — Universal Quick Add sheet; long-press = Voice capture.
- **Gestures** — Task row: swipe right = complete, swipe left = reschedule sheet. Long-press = select / drag. Board = horizontal snap pages with pager.
- **Detail** — Task detail is a pushed full-screen view; sculpted corner keeps Complete.
- **Summary-first** — Overview shows Now card, 3 numbers, Up next and the compact Streak Ribbon only.
- **Signature budget** — Max one signature card per mobile viewport.



---

## PM04 · Persian RTL validation  
`boards/PM04MobileFa.dc.html` · `screenshots/PM04MobileFa.jpg` · dark: `PM04MobileFaDark`

#### RTL rules · 8

- **Shell** — Bottom nav order mirrors (Today on the right). Rail on desktop moves to the right edge; command bar mirrors; sculpted corners move to top-left.
- **Lists & board** — Checkbox on the right, time on the left. Board columns read right→left (Today first). Swipe directions mirror.
- **Mixed text** — Each user-generated line uses dir="auto"; Latin names (Katy, Figma) stay LTR inside RTL rows. Numbers follow the Digits setting (Persian digits shown).
- **Timers & times** — Clock digits are an LTR island (۱۸:۲۴), right-aligned. Time ranges keep start → end order visually as ۱۴:۰۰ – ۱۶:۰۰.
- **DataViz** — Follow approved DataViz RTL rules (A-mirror for time-ordered and flow charts; Focus Clock not mirrored — clockwise hours are universal). Never CSS-flip a chart wholesale.
- **Calendar** — Jalali primary, Saturday first, Friday red; “Next working day” on Thursday evening resolves to Saturday.
- **Folder tabs** — Fillets mirror; on mobile folder tabs become pill tabs (same order, starting right).
- **Type** — Vazirmatn; line-height +0.15 vs Latin; bold 700 for Persian headings (500 Latin).


