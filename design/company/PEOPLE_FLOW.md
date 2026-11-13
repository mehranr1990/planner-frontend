# Shared components: PeopleWorkload & CaseFlow

Two shared components, restored from the S5 Team and Case Flow concept boards at the owner's request (10 Nov 2026).
Build each **once** as a shared component, then reuse it in every context. Each context passes its own accent colour.

| Context | deep | soft | bar / line |
|---|---|---|---|
| Projects | `#0F5BA8` | `#E0F0FF` | `#5AB4FF` |
| Teams | `#4343C8` | `#ECECFF` | `#8B8BFF` |
| Companies | `#7A2BC4` | `#F4E9FF` | `#C07BFF` |
| Social | `#C2410C` | `#FFEBDD` | `#FF9A6B` |
| Admin | `#2B2F36` | `#E8E9EC` | colour of the case's context |

Dark mode uses the same token mapping as every other card (see the `…Dark` boards).

## 1. PeopleWorkload (notched people card)

Used in: TM-01 (full), TM-08 (strip only, rows hidden), CO-03 (per department), SO-19 (status only).

**Geometry**
- A product card (radius 32) with a **top-centre notch** in the canvas colour: height 84, bottom radius 42, two 30px fillets.
- The notch holds the **avatar picker**, so it is never empty.
- Width = members × 58 + 24. At most 8 avatars; after that a "+N" chip opens the full list.

**Avatar picker**
- `role="radiogroup"`; each avatar is a `radio` with the label "Name, status".
- The selected avatar gets a 3px ring in the deep colour; the others get a white ring.
- A presence dot sits under each avatar.
- The list is sorted A–Z and is never a ranking.

**Header row**
- Title on the start side, legend on the end side. The legend shows only the statuses used in that context (Social has no "Off today").
- On CO-03 the department pills sit above the card.

**Selected-person strip** (soft background, radius 22). It shows, in order:
1. avatar;
2. name, role · status + note;
3. **NOW WORKING ON** — shown only if the person turned on "Share what I'm working on" in Set status; otherwise "Not shared". Social never shows this block.
4. this-week booked bar;
5. action: **Message** (opens a DM in Messages), or **Set status** when you select yourself.

**Rows**
- Each row has an avatar with presence dot, name, role, a booked bar (used / over-100% red segment / free) and the % value.
- Status-only mode (Social, or roles without workload rights): the bar is replaced by status text.
- Grid of 3 columns (4 on CO-03 and SO-19).

**Data rules**
- Status is **manual** (owner decision): Available · Busy · Away · Off today + note + clear after. It is set only by the person and never derived from a calendar, location or activity.
- Booked % = estimates of work assigned this week ÷ capacity. It never uses Personal focus or time blocks.
- No ranking, no "last seen", no productivity score.

**Phone (390)**
- The notch avatar row becomes a horizontal scroll row at the top of the card.
- The strip stacks: name and status, then the booked bar, then the action.
- The rows become a list.

**RTL**
- The notch stays centred.
- Order is mirrored by `dir="rtl"`; bars fill from the start side; digits are Persian.

## 2. CaseFlow (notched flow board)

Used in: PJ-06 (milestone/task flow), TM-02 (Flow view), CO-09 (approval chain of the selected item), AD-05 (case of the selected report).

**Geometry**
- A card with radius 36 and a **top-centre notch** (height 88, 32px fillets).
- The notch holds the **people of this flow**. Each person has a badge:
  - number = open steps (badge in the line colour);
  - red = has a blocked, waiting or overdue step;
  - ✓ = all their steps are done;
  - **+** = no step in this flow. Clicking + opens the assign / filter-by-person action.
- Header: title on the start side; round icon buttons on the end side (Filter · Share · Open in calendar).

**Body**
- Stage columns, each in a soft panel (radius 28). Each column has max 5 rows; beyond that "+N more" opens the List, filtered.
- 48px gutters between columns hold the connectors.
- The last block is a 2-column grid of **outcome tiles**. The highlighted tile uses the deep colour.
- Each column has a label underneath.

**Rows** (72px each)
- Leading element: the person's avatar, or a round **+** (unassigned), or a system icon (automatic step).
- Then the title (bold when current), an optional sub-line, and a state:
  - ✓ done;
  - ••• in progress / current;
  - "Blocked" chip;
  - nothing for not started.
- Clicking a row opens that context's drawer (task drawer / approval card / case card).

**Connectors**
- A curve from the end dot of a row to the start dot of a row in the next column.
- Solid in the line colour = satisfied / handed over.
- **Dashed red** = still waiting (blocked dependency, SLA or escalation at risk).
- A deep-colour arrow runs into an outcome tile.
- The connectors are `aria-hidden`. Screen readers get the same links as text in the row's sub-line ("Needs …").

**Meaning per context**

| Context | Columns | Rows | Lines | Outcome tiles |
|---|---|---|---|---|
| PJ-06 | workflow statuses (Blocked = row state) | tasks of the filter (milestone / all / mine) | task dependencies (same as Gantt) | Done tasks + milestone |
| TM-02 | team statuses | this week's plan tasks | task dependencies | Done this week |
| CO-09 | steps of the chain version | actions in each step | hand-off between steps; dashed = escalation route | what happens after approval |
| AD-05 | Intake · Triage · Action | case steps by admin | in the case's context colour; dashed = SLA at risk | possible outcomes |

**Read-only**
- CaseFlow never decides anything.
- Approvals, suspensions and status changes stay in their signature cards (notch actions).

**Phone**
- Columns are stacked as product cards with their rows.
- Lines are replaced by a "→ needed by …" caption.
- See TM-02 tab "Flow · phone & فارسی".

**RTL**
- Columns are reversed by `dir="rtl"`.
- Connector SVGs are mirrored with `scaleX(-1)`.
- Dots use `inset-inline-start` / `inset-inline-end`.
