# design/messages — Messages & Meetings (Phase 5) · complete package

**For Claude Code.** Read this file, then `SCREENS.md`, `DECISIONS.md`, and only the `SPEC.md` section of the screen you are building. The approved delete/edit policy is `13_MESSAGING_DELETE_POLICY_FINAL.md` (copied in this folder) — it wins over anything here.
Prerequisites: Personal, Projects, Teams and Companies implemented (channels live inside their rails). This package only ADDS `design/messages/`.

## What is designed
- **Batch A** — MS-01 shell & access · MS-02 Direct conversation (+ list) · MS-03 Work channel (in a project) · MS-04 Message actions (edit/delete/forward/report) · MS-05 Composer states · MS-90 sheets (conversation-new, channel-new).
- **Batch B** — MS-06 Thread · MS-07 Search · MS-08 Conversation info · MS-09 Privacy & notifications.
- **Batch C** — MT-01 Meetings list · MT-02 Meeting page · MT-03 Minutes & action items · MT-04 Announcements.
- **Variants** — dark for every board; mobile `MSM01MessagesMobile`; Persian `MSM02MessagesFa`.

## Non-negotiable
1. **Place (owner decision):** global `/messages` (header button everywhere) + a “Channels” item inside each workspace rail showing the same conversations. /messages has no context rail; the conversation list replaces it.
2. **Colour (owner decision):** source colour — Direct & groups neutral slate (`#3D4A5C` / `#E9EDF2`), project channels blue, team indigo, company purple. My bubbles use the source colour. Volt only for now/today.
3. **Receipts (owner decision):** on in direct messages, off in groups/channels; reciprocal (hide yours → can’t see others’). Workspace can force off, never on.
4. **Edit/delete:** edit ≤ 48h (author); delete-for-everyone ≤ 48h in direct/private groups, in work channels only if channel policy allows; afterwards delete-for-me only. The server decides; UI shows “n h left”.
5. **Privacy:** no one (incl. company admins) can read or search others’ direct messages; search only within visible history; newcomers see private-group history from join.
6. **Media:** images, files, voice ≤ 2:00 and ≤ 10 MB. No voice/video calls, no E2EE in v1, link previews off by default.
7. **Meetings (owner decision):** created from calendars (Personal/project/team/company), own page `/messages/meetings/[id]`, Meetings tab in /messages. Minutes Draft → In review → Approved → Final; action items create authoritative tasks with normal assignment.
8. **Announcements:** workspace-scoped, audience, pin, optional acknowledgement.
9. Signature cards (notch never empty): MT-02 meeting head (Open meeting link / Edit / Copy link) · MT-03 review card (Approve minutes) · MT-04 composer (Publish). Conversations, bubbles and lists are product surfaces (no notch).
10. Mock adapters only (backend Phase 5 not built); live updates simulated in the mock; idempotent client op ids in the API shape.
11. One screen per task · stop · commit, don’t push · no new dependencies (no chat SDK, no audio library — use MediaRecorder behind a feature check) · tsc + eslint + targeted vitest.
12. If something is not in the boards/spec: stop and ask.
