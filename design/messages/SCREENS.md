# Messages & Meetings — screen registry

All designed ✅ (awaiting owner approval). Backend Phase 5 not built → mock adapters.

| ID | Route | Screen | Batch | Board | New components | Backend (V3) |
|---|---|---|---|---|---|---|
| MS-01 | (shell) | Header Messages button, Channels rail items, access states | A | `MS01MessagesShell` | MessagesButton, ChannelsRailItem | P5-01/04 |
| MS-02 | `/messages`, `/messages/[cid]` | List + direct conversation | A | `MS02DirectConversation` | ConversationList, Bubble, VoiceBubble, Tombstone, UnreadLine | P5-01/03 |
| MS-03 | `/projects/[id]/channels/[cid]` (same for teams/companies) | Work channel | A | `MS03WorkChannel` | ChannelList, PinnedBar | P5-01/02 |
| MS-04 | (in conversation) | Message actions, delete/edit/forward/report dialogs | A | `MS04MessageActions` | HoverToolbar, MessageMenu, DeleteDialog | P5-02 |
| MS-05 | (in conversation) | Composer states | A | `MS05Composer` | Composer, MentionPicker, VoiceRecorder | P5-02/03 |
| MS-90 | `?sheet=conversation-new · channel-new` | Sheets | A | `MS90MessageSheets` | — | P5-01 |
| MS-06 | `/messages/[cid]/thread/[mid]` | Thread panel | B | `MS06Thread` | ThreadPanel | P5-02 |
| MS-07 | `/messages/search` | Search | B | `MS07Search` | SearchResults | P5-02 |
| MS-08 | `/messages/[cid]/info` (panel) | Conversation info | B | `MS08ConversationInfo` | InfoPanel | P5-01/02/06 |
| MS-09 | `/messages/settings` | Privacy & notifications | B | `MS09MessageSettings` | — | P5-03/04/06 |
| MT-01 | `/messages/meetings` | Meetings list | C | `MT01Meetings` | MeetingRow | P5-05 |
| MT-02 | `/messages/meetings/[id]` (+ `?sheet=meeting-new` from calendars) | Meeting page | C | `MT02MeetingPage` | MeetingHead, AgendaList | P5-05 |
| MT-03 | `/messages/meetings/[id]/minutes` | Minutes & action items | C | `MT03Minutes` | MinutesDoc, ReviewCard | P5-05 |
| MT-04 | `/{workspace}/announcements` | Announcements | C | `MT04Announcements` | AnnouncementCard, AckStatus | P5-05 |

## Mobile & locale
- `MSM01MessagesMobile`: list, direct, long-press actions, voice, channel, meeting, minutes, announcement, settings. Conversations full screen without the context bottom nav.
- `MSM02MessagesFa`: list, direct (my bubbles on the left), delete sheet, meeting.
- Dark: every board `…Dark`.
