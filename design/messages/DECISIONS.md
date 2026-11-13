# Messages & Meetings — decision ledger

## APPROVED (owner documents + owner answers 2 Nov 2026)
- One conversation engine: direct, private groups, workspace channels; friends can message without work affiliation.
- Delete/edit policy = `13_MESSAGING_DELETE_POLICY_FINAL.md` (48h rules, delete-for-self anytime, moderation separate).
- Images, files, voice ≤ 2 min AND ≤ 10 MB; no live audio/video; no v1 E2EE; link previews only if authorised.
- Block stops direct contact and presence; shared groups remain readable; newcomers see private-group history from join.
- Meetings: invite/RSVP, agenda, minutes draft/review/approve/final, decisions, action items → authoritative tasks, files, external URL. Announcements with scope, pin, optional acknowledgement.
- **Owner answer:** /messages is global (header button) + Channels inside each workspace.
- **Owner answer:** colour = source of the conversation (neutral slate for direct/groups).
- **Owner answer:** read receipts/last seen on in direct, off in groups/channels, reciprocal.
- **Owner answer:** meetings live in calendars + their own page; list under /messages › Meetings.

## APPLIED DEFAULTS (design proposals)
| # | Decision | Applied | Alternative |
|---|---|---|---|
| M1 | Neutral token | `--msg-deep #3D4A5C`, soft `#E9EDF2`, dot `#8C9AAE` (dark `#A9B6C8` / `#2A313B`) | reuse Personal mint |
| M2 | Channels rail position | first item of the last rail group in Project/Team/Company | own group |
| M3 | Notifications | Direct + mentions notify; other messages badge only; quiet hours | all notify |
| M4 | Who can DM me | connections + people sharing a workspace | anyone with the email |
| M5 | Thread “also send to channel” | optional checkbox | none |
| M6 | Group newcomers | history from join (private groups), channel policy for work channels | full history |
| M7 | Minutes reviewers | chosen by organiser; all must approve; organiser marks Final | majority |
| M8 | Announcements replies | none by default; workspace may enable comments | always |
| M9 | Mobile | context bottom nav hidden inside conversations | keep nav |
| M10 | Shortcut | ⌘/Ctrl+Shift+M opens /messages | none |

## OPEN (Claude Code must NOT invent)
- Retention durations per conversation type (backend legal review).
- Whether workspace admins can export work-channel history (policy pending).
- Group size limit and channel member limit (server config).
- Moderator role naming in Teams/Projects (design uses “channel admin” + workspace admin).
