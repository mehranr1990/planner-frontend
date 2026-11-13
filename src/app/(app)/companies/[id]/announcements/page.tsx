import { AnnouncementsScreen } from "@/features/messages/announcements/announcements-screen";

export const instant = false;

/** MT-04 · Announcements: /companies/[id]/announcements (inside the Channels item). */
export default function AnnouncementsPage() {
  return <AnnouncementsScreen kind="company" />;
}
