# Social — screen registry

All designed ✅ (awaiting owner approval). Backend Phase 6 not built → mock adapters.

| ID | Route | Screen | Batch | Board | New components | Backend (V3) |
|---|---|---|---|---|---|---|
| SO-01 | (shell) | 5th context, rails, mobile nav, access states | A | `SO01SocialShell` | SocialRail, GroupRail | P6-01 |
| SO-02 | `/social/connections` (+ `/social` home) | Connections, requests, circles | A | `SO02Connections` | ConnectionRow, CircleChips, ConnectionCard | P6-01 |
| SO-03 | `/social/groups?tab=mine·discover` | Groups: discover & join | A | `SO03Groups` | GroupCard, JoinRequest | P6-01 |
| SO-04 | `/social/groups/[id]` | Group overview | A | `SO04GroupOverview` | NextActivityCard, BalanceCard | P6-01/02/03 |
| SO-90 | `?sheet=group-new · activity-new · connect` | Sheets | A | `SO90SocialSheets` | — | P6-01/02 |
| SO-05 | `/social/activities/[id]` | Activity | B | `SO05Activity` | Itinerary, RsvpCard, Waitlist | P6-02 |
| SO-06 | `/social/activities/[id]/poll` | Poll & free/busy | B | `SO06PollSchedule` | PollCard, FreeBusyGrid | P6-02 |
| SO-07 | `/social/groups/[id]/expenses` (activity: `/social/activities/[id]/expenses`) | Shared expenses & balances | C | `SO07SharedExpenses` | SharedExpenseRow, BalanceSummary | P6-03 |
| SO-08 | `…/expenses/[eid]` (+ `?sheet=expense-propose`) | Expense detail & split | C | `SO08ExpenseSplit` | SplitEditor | P6-03 |
| SO-09 | `…/expenses/settle` | Settle up | C | `SO09SettleUp` | SettlementRow, PaymentCard | P6-03 |
| SO-10 | `/social/groups/[id]/lending` | Lending & lost/found | C | `SO10Lending` | ThingRow, LoanCard, LostFoundPost | P6-04 |
| SO-11 | `/social/groups/[id]/album[/albumId]` | Album | C | `SO11Album` | AlbumGrid | P6-05 |
| SO-12 | `/social/groups/[id]/challenges` | Challenges | C | `SO12Challenges` | ChallengeCard | P6-05 |
| SO-15 | `/social` | Social home | D | `SO15SocialHome` | NextActivityCard, NeedsYouList | P6-01..04 |
| SO-16 | `/social/activities` (+ group Activities item) | Activities list | D | `SO16Activities` | ActivityRow | P6-02 |
| SO-17 | `/social/balances` | My balances (per currency) | D | `SO17MyBalances` | ScopeBalanceRow, CurrencyTotals | P6-03 |
| SO-18 | `/social/lending` | My things & lending | D | `SO18MyThings` | ThingCard | P6-04 |
| SO-19 | `/social/groups/[id]/members` | Group members | D | `SO19GroupMembers` | MemberCard | P6-01, **PeopleWorkload (status only)** |
| SO-14 | `/social/groups/[id]/settings?tab=general·members·leave` | Group settings & leave | C | `SO14GroupSettings` | LeaveChecklist | P6-01/06 |

## Mobile & locale
- `SOM03SocialMobile2`: SO-15…SO-19 phones + Persian SO-15 and SO-17.
- `SOM01SocialMobile`: home, group, activity, poll, propose expense sheet, settle up, lending, album, challenge.
- `SOM02SocialFa`: group overview, activity, expenses, lending (Toman with Persian digits).
- Dark: every board `…Dark`.
