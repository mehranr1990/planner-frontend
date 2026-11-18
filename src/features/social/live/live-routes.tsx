"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useActivity } from "@/data/social-queries";
import { socialHref } from "../paths";
import { queryGate, SocialPageHeader } from "../social-ui";
import { ActivityGoals } from "./activity-live";
import { InvitationScreen, RecoveryScreen } from "./group-live";

/* Route entries for the live-contract screens (ids from the URL). */

const useId = () => String(useParams<{ id: string }>()?.id ?? "");

/** /social/invitations/[id]#proof=… */
export function InvitationRoute() {
  return <InvitationScreen invitationId={useId()} />;
}

/** /social/recover/[id] */
export function RecoveryRoute() {
  return <RecoveryScreen groupId={useId()} />;
}

/** /social/activities/[id]/goals — the minimal Activity-context goals route. */
export function ActivityGoalsRoute() {
  const t = useTranslations("Social.live.goal");
  const id = useId();
  const activity = useActivity(id);
  const gate = queryGate([activity]);
  if (gate) return gate;
  const a = activity.data!;
  return (
    <>
      <SocialPageHeader trail={[{ label: a.title, href: socialHref.activity(a.id) }, { label: t("screenTitle") }]} title={t("screenTitle")} />
      <ActivityGoals activityId={a.id} canCreate={!!a.server?.manage && a.server.state === "planned"} />
    </>
  );
}
