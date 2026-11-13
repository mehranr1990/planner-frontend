"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { createContext, useContext, type ReactNode } from "react";
import { AccessLoading, AccessState } from "@/components/feedback/access-state";
import { ErrorState } from "@/components/feedback/state-views";
import { Button } from "@/components/ui/button";
import type { GroupDetail } from "@/data/social-domain";
import { useSocialAvailable } from "@/data/social-provider";
import { useSocialMutation } from "@/data/social-queries";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { socialHref } from "./paths";
import { useCurrentSocialGroup } from "./use-social";

/*
 * Social gates (SO-01). SocialAvailability: live API mode has no Social
 * backend yet → the "not available" state, never mock data. SocialGroupGate
 * (/social/groups/[id]/…): the server's access answer decides — member →
 * the page; join requested → public preview only; activity guest → only
 * their activity; left → own balance until settled; anything else (private,
 * deleted, removed, unknown) → the same "not available" copy (no discovery).
 */

export function SocialAvailability({ children }: { children: ReactNode }) {
  const available = useSocialAvailable();
  if (!available) return <AccessState kind="social-off" />;
  return <>{children}</>;
}

const GroupContext = createContext<GroupDetail | null>(null);

/** The group of the current /social/groups/[id] route (inside the gate). */
export function useSocialGroup(): GroupDetail {
  const group = useContext(GroupContext);
  if (!group) throw new Error("useSocialGroup must be used inside SocialGroupGate");
  return group;
}

export function SocialGroupGate({ children }: { children: ReactNode }) {
  const t = useTranslations("Social");
  const { access } = useCurrentSocialGroup();
  const cancel = useSocialMutation((repo, groupId: string) => repo.groups.cancelJoin(groupId));
  const back = (
    <Button asChild variant="secondary">
      <Link href={socialHref.home}>{t("access.toSocial")}</Link>
    </Button>
  );

  if (access.isError) return <ErrorState onRetry={() => void access.refetch()} />;
  if (!access.data) return <AccessLoading />;
  const answer = access.data;
  if (answer.kind === "member") return <GroupContext.Provider value={answer.group}>{children}</GroupContext.Provider>;
  if (answer.kind === "join-requested") {
    const preview = answer.preview;
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <AccessState kind="social-requested" values={{ group: preview.name }} titleAs="h1" primaryAction={back} secondaryAction={
          <Button variant="ghost" disabled={cancel.isPending} onClick={() => cancel.mutate(preview.id)}>
            {t("groups.cancelAsk")}
          </Button>
        } className="py-6" />
        <ProductCard className="flex flex-col gap-2">
          <h2 className="type-title text-fg">
            <bdi>{preview.name}</bdi>
          </h2>
          <p className="text-sm text-fg-secondary">{preview.description}</p>
          <p className="text-xs font-semibold text-fg-muted">
            {t(`topics.${preview.topic ?? "unknown"}`)} · {t("people", { count: preview.size ?? 0, n: preview.size === null ? t("common.notShown") : String(preview.size) })}
          </p>
          <p className="text-xs text-fg-muted">{t("groups.previewNote")}</p>
        </ProductCard>
      </div>
    );
  }
  if (answer.kind === "guest") {
    return (
      <AccessState
        kind="social-guest"
        values={{ group: answer.groupName }}
        primaryAction={
          <Button asChild>
            <Link href={socialHref.activity(answer.activityIds[0]!)}>{t("access.openActivity")}</Link>
          </Button>
        }
        secondaryAction={back}
      />
    );
  }
  if (answer.kind === "left") {
    return (
      <AccessState
        kind="social-left"
        values={{ group: answer.groupName }}
        primaryAction={
          answer.openBalance ? (
            <Button asChild>
              <Link href={socialHref.balances}>{t("access.openBalances")}</Link>
            </Button>
          ) : (
            back
          )
        }
        secondaryAction={answer.openBalance ? back : undefined}
      />
    );
  }
  return <AccessState kind="social-not-available" primaryAction={back} />;
}
