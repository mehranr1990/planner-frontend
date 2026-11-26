"use client";

import { UsersRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { PendingGroupInvitation } from "@/data/social-domain";
import { serviceKeys } from "@/data/personal-services-queries";
import { usePendingGroupInvitations, useSocialPurgeMutation } from "@/data/social-queries";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { cn } from "@/lib/cn";
import { useSocialFormat } from "../format";
import { socialHref } from "../paths";
import { isUnsupported } from "../social-ui";
import { useSocialErrorText } from "../use-social";

/*
 * Social home · pending group invitations (GET /social-group-invitations):
 * the verified invitee's ordinary pending list, shown whatever the in-app
 * notification setting is. Accept / Decline request a fresh proof for the
 * revision shown (POST …/{id}/proof, If-Match) and answer with it inside
 * the adapter — no proof reaches the UI, storage or logs. A stale revision
 * (conflict) refetches the list; expired rows are not actionable; answered
 * or revoked offers leave the list after the refresh.
 */

export function PendingGroupInvitations() {
  const t = useTranslations("Social.live.pending");
  const errorText = useSocialErrorText();
  const list = usePendingGroupInvitations();
  if (list.isError && isUnsupported(list.error)) return null;
  const rows = list.data?.pages.flatMap((page) => page.items) ?? [];
  if (list.isSuccess && rows.length === 0) return null;
  return (
    <ProductCard as="section" aria-labelledby="social-pending-invitations" className="flex flex-col gap-3">
      <h2 id="social-pending-invitations" className="text-sm font-bold text-fg">
        {t("title")}
      </h2>
      {list.isPending ? (
        <Skeleton className="h-20 rounded-row" />
      ) : list.isError ? (
        <InlineAlert
          tone="danger"
          title={errorText(list.error)}
          action={
            <Button size="sm" variant="secondary" onClick={() => void list.refetch()}>
              {t("retry")}
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <PendingRow key={row.id} row={row} />
          ))}
        </ul>
      )}
      {list.hasNextPage ? (
        <Button size="sm" variant="ghost" className="self-center" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
          {t("more")}
        </Button>
      ) : null}
    </ProductCard>
  );
}

export function PendingRow({ row, detailLink = true }: { row: PendingGroupInvitation; detailLink?: boolean }) {
  const t = useTranslations("Social.live.pending");
  const format = useSocialFormat();
  const errorText = useSocialErrorText();
  const router = useRouter();
  const client = useQueryClient();
  const answer = useSocialPurgeMutation((repo, accept: boolean) => repo.invitations.answerPending(row, accept));
  // The time the row was first shown (render stays pure); a refetch after any answer drops ended offers.
  const [now] = useState(() => Date.now());
  const expired = Date.parse(row.expiresAt) <= now;
  const name = row.groupName ?? t("unnamed");
  const respond = (accept: boolean) =>
    answer.mutate(accept, {
      onSuccess: ({ groupId }) => {
        void client.invalidateQueries({ queryKey: serviceKeys.invitationFeed });
        if (accept) router.push(groupId ? socialHref.group(groupId) : socialHref.home);
      },
      onError: () => void client.invalidateQueries({ queryKey: serviceKeys.invitationFeed }),
    });
  return (
    <li data-unread={row.readAt ? undefined : true} className={cn("flex flex-col gap-2 rounded-row p-3", row.readAt ? "bg-subtle/60" : "bg-subtle")}>
      <div className="flex min-w-0 items-start gap-2">
        <UsersRound aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-fg-secondary" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {detailLink ? (
            <Link href={socialHref.invitation(row.id)} className="min-w-0 text-sm font-bold text-fg underline-offset-2 hover:underline">
              <bdi dir="auto">{name}</bdi>
            </Link>
          ) : (
            <p className="min-w-0 text-sm font-bold text-fg">
              <bdi dir="auto">{name}</bdi>
            </p>
          )}
          <p className="text-xs text-fg-secondary">
            <bdi dir="auto">{[row.inviterName ? t("from", { name: row.inviterName }) : null, row.role ? t("role", { role: row.role }) : null].filter(Boolean).join(" · ")}</bdi>
          </p>
          <p className="text-xs text-fg-muted">
            {row.createdAt ? `${t("sent", { when: format.relative(row.createdAt) })} · ` : null}
            {expired ? <span className="font-semibold text-danger-text">{t("expired")}</span> : t("expires", { when: format.relative(row.expiresAt) })}
            {row.readAt ? null : <span className="sr-only"> · {t("unread")}</span>}
          </p>
        </div>
      </div>
      {answer.isError ? <InlineAlert tone="danger" title={errorText(answer.error)} /> : null}
      {expired ? null : (
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button size="sm" variant="secondary" disabled={answer.isPending} onClick={() => respond(false)}>
            {t("decline")}
          </Button>
          <Button size="sm" loading={answer.isPending} onClick={() => respond(true)}>
            {t("accept")}
          </Button>
        </div>
      )}
    </li>
  );
}
