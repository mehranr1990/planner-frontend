import { AnnouncementsScreen } from "@/features/messages/announcements/announcements-screen";

export const instant = false;

/** MT-04 · Announcements: /projects/[id]/announcements (inside the Channels item). */
export default function AnnouncementsPage() {
  return <AnnouncementsScreen kind="project" />;
}
