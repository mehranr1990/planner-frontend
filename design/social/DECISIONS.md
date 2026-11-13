# Social — decision ledger

## APPROVED (owner documents + owner answers 2 Nov 2026)
- Mutual connections, privacy-preserving lookup; circles = private labels; Social Groups distinct from Teams (Owner/Admin/Member), private by default, discoverable preview opt-in, approval always required.
- Activities independent or group-owned; templates; multi-day; RSVP Going/Maybe/Declined/Pending; capacity & waitlist; consent-based free/busy; polls; checklists/tasks/files; chat via Phase 5.
- Shared expenses: any verified participant proposes; only approved records count; edits create pending revision; equal/fixed/percent/weighted/selected; exact remainder; settlement = request + confirmation; optional idempotent Personal Finance posting.
- Lending + Lost & Found with mutual confirmation; no fines. Private albums ≤ 20 MB originals. Voluntary challenges; no auto-publication of private habits. Departure keeps necessary records and revokes access.
- **Owner answer:** Social = 5th context in the switcher.
- **Owner answer:** coral colour.
- **Owner answer:** one currency per group/activity.
- **Owner answer:** albums and challenges included now.

## APPLIED DEFAULTS (design proposals)
| # | Decision | Applied | Alternative |
|---|---|---|---|
| S1 | Routes | `/social`, `/social/connections`, `/social/groups/[id]/…`, `/social/activities/[id]/…` | — |
| S2 | Ignore request | silent; resend blocked 30 days | notify sender |
| S3 | Waitlist | first in line offered the spot for 12 h | auto-add |
| S4 | Expense approvers | owner/admins + activity organiser | owner only |
| S5 | Balance visibility | own only; admins see all (setting) | everyone sees all |
| S6 | Split remainder | payer first, then member order | random |
| S7 | Settlement dispute | “not received” with note | none |
| S8 | Album | EXIF location stripped from display copies | keep |
| S9 | Challenge ranking | off; optional individual totals without ranks | leaderboard |
| S10 | Owner leaving | must transfer first | auto-transfer to oldest admin |

## OPEN (Claude Code must NOT invent)
- Group size limits; album storage quota (Phase 7 Admin).
- Who may see free/busy “always” (design: per circle, user-chosen).
- Whether activity guests may propose expenses in group-owned activities (design: yes, if they participate).

## OWNER UPDATE · 10 Nov 2026 — concept components restored
- Owner asked to bring back **People & workload** (S5 Team) and **Case Flow** (notched board). Spec: `PEOPLE_FLOW.md` (shared components, accent per context).
- People & workload: SO-19 “Who’s around” (status only), SO-04 status dots.
- Case Flow: —.
- Social status is per group, optional, set by the person; no workload, no now-working-on, no last-seen.
