# design/social — Social (Phase 6) · complete package

**For Claude Code.** Read this file, then `SCREENS.md`, `DECISIONS.md`, and only the `SPEC.md` section of the screen you are building.
Prerequisites: everything before it (Personal, Projects, Teams, Companies, Messages). Group and activity chat use the Messages engine. This package only ADDS `design/social/`.

## What is designed
- **Batch A** — SO-01 shell & access (5th context) · SO-02 Connections & circles · SO-03 Groups: discover & join · SO-04 Group overview · SO-90 sheets (group-new, activity-new, connect).
- **Batch B** — SO-05 Activity (itinerary, RSVP, capacity, waitlist, checklist) · SO-06 Poll & consent-based free/busy.
- **Batch C** — SO-07 Shared expenses & balances · SO-08 Expense detail & split · SO-09 Settle up · SO-10 Lending & lost/found · SO-11 Album · SO-12 Challenges · SO-14 Group settings & leave.
- **Batch D (completion)** — SO-15 Social home · SO-16 Activities list · SO-17 My balances · SO-18 My things & lending · SO-19 Group members (+ `SOM03SocialMobile2`). Every rail item now has a board.
- **Variants** — dark for every board; mobile `SOM01SocialMobile`; Persian `SOM02SocialFa`.

## Non-negotiable
1. **5th context (owner decision)**: `social` added to `contexts.ts` after `company`; `/social` home rail and `/social/groups/[id]` group rail (see SO-01). Coral scope `data-scope="social"` (deep `#C2410C`, soft `#FFEBDD`, dot `#FF9A6B`; dark `#FFA77D` / `#4A2A1C`).
2. **Privacy:** connections are mutual; lookup never reveals whether an account exists; circles are private labels; groups private by default; discoverable groups show a preview only and always require approval; join requesters see nothing inside.
3. **Shared expenses:** one currency per group/activity (owner decision); proposed items and pending edits never change balances; exact integer splits with deterministic remainder; each person sees own share/paid/owed; settlement = record + confirm, never money movement; Personal Finance only by explicit, idempotent opt-in.
4. **Lending / lost & found:** handover and return need both sides’ confirmation; no fines; never show a home address.
5. **Album:** private, ≤ 20 MB per original, display copies without location; quota later (not enforced).
6. **Challenges:** voluntary; numbers entered in the challenge only; nothing auto-published from Personal habits; no leaderboard by default.
7. Signature cards (notch never empty): SO-02 connection (Message) · SO-04 next activity (Open activity) · SO-05 RSVP (Change RSVP) · SO-06 poll (Pick final date) · SO-07 balance (Settle up) · SO-08 approval (Approve expense) · SO-09 payment (Record payment) · SO-10 loan (Confirm handover / return) · SO-12 challenge (Log progress) · SO-15 next activity (Open activity) · SO-17 totals (Settle up) · SO-19 member (Message).
8. Mock adapters only; repository names in SPEC “Data & backend” tabs.
9. One screen per task · stop · commit, don’t push · no new dependencies · tsc + eslint + targeted vitest.
10. If something is not in the boards/spec: stop and ask.


## Update 10 Nov 2026
Shared components **PeopleWorkload** and **CaseFlow** restored from the concept boards → read `PEOPLE_FLOW.md`. Affected boards: SO-19 “Who’s around” (status only), SO-04 status dots . Build each component once; the first prompt that needs it builds it.
