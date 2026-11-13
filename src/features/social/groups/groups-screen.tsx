"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { EmptyState, ErrorState } from "@/components/feedback/state-views";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { PillGroup } from "@/components/ui/pills";
import { SearchField } from "@/components/ui/search-field";
import { Segmented } from "@/components/ui/segmented";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import type { GroupPreview, GroupSummary, GroupTopic } from "@/data/social-domain";
import { useDiscoverGroups, useJoinRequests, useSocialDirectory, useSocialMutation } from "@/data/social-queries";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { useSocialFormat } from "../format";
import { socialHref } from "../paths";
import { useOpenSocialSheet } from "../sheets/social-sheet-params";
import { PersonAvatar, SectionHead, SocialPageHeader } from "../social-ui";
import { useSocialErrorText } from "../use-social";

/*
 * SO-03 · Groups: discover & join (/social/groups?tab=mine|discover).
 * Groups are private by default; Discover lists only groups whose owner made
 * them discoverable (preview: name, description, size, rules, topic — never
 * member names or content), with topic pills and text search (no
 * recommendations). Ask to join with an optional note → admins approve /
 * decline; the requester sees nothing more until approved.
 */

type Tab = "mine" | "discover";
const TOPICS: (GroupTopic | "all")[] = ["all", "outdoors", "sport", "family", "food", "travel", "books", "other"];

export function GroupsScreen() {
  const t = useTranslations("Social");
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const openSheet = useOpenSocialSheet();
  const tab: Tab = params.get("tab") === "discover" ? "discover" : "mine";
  return (
    <>
      <SocialPageHeader
        trail={[{ label: t("groups.title") }]}
        title={t("groups.title")}
        actions={
          <>
            <Segmented<Tab>
              label={t("groups.title")}
              value={tab}
              onValueChange={(value) => router.replace(value === "discover" ? `${pathname}?tab=discover` : pathname, { scroll: false })}
              options={[
                { value: "mine", label: t("groups.tabs.mine") },
                { value: "discover", label: t("groups.tabs.discover") },
              ]}
            />
            <Button className="gap-2" aria-haspopup="dialog" onClick={() => openSheet("group-new")}>
              <Icon icon={Plus} size={16} />
              {t("common.newGroup")}
            </Button>
          </>
        }
      />
      {tab === "mine" ? <MyGroups /> : <Discover />}
    </>
  );
}

function MyGroups() {
  const t = useTranslations("Social");
  const directory = useSocialDirectory();
  const openSheet = useOpenSocialSheet();
  if (directory.isError) return <ErrorState onRetry={() => void directory.refetch()} />;
  if (!directory.data) return <AccessLoading />;
  const { groups, joinRequestsPending } = directory.data;
  const adminGroups = groups.filter((g) => g.pendingRequests > 0);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <div className="flex min-w-0 flex-col gap-3">
        {groups.length === 0 ? (
          <EmptyState title={t("groups.mineEmpty.title")} description={t("groups.mineEmpty.body")} primaryAction={<Button onClick={() => openSheet("group-new")}>{t("common.newGroup")}</Button>} />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {groups.map((group) => (
              <GroupCard key={group.id} group={group} />
            ))}
          </ul>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        {adminGroups.map((group) => (
          <JoinRequestsCard key={group.id} groupId={group.id} groupName={group.name} />
        ))}
        {joinRequestsPending.length > 0 ? (
          <ProductCard as="section" aria-labelledby="sent-requests" className="flex flex-col gap-2">
            <SectionHead id="sent-requests" as="h3" title={t("groups.sentRequests")} />
            <ul className="flex flex-col gap-1.5">
              {joinRequestsPending.map((r) => (
                <li key={r.groupId}>
                  <Link href={socialHref.group(r.groupId)} className="flex min-h-touch items-center justify-between gap-2 rounded-row bg-subtle px-3 text-sm font-semibold text-fg hover:bg-raised">
                    <bdi className="truncate">{r.groupName}</bdi>
                    <span className="shrink-0 rounded-pill bg-raised px-2.5 py-0.5 text-xs text-fg-secondary">{t("groups.requested")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </ProductCard>
        ) : null}
      </div>
    </div>
  );
}

function GroupCard({ group }: { group: GroupSummary }) {
  const t = useTranslations("Social");
  const format = useSocialFormat();
  return (
    <li>
      <Link href={socialHref.group(group.id)} className="flex h-full flex-col gap-3 rounded-product bg-surface p-5 transition-colors hover:bg-subtle">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="inline-flex size-12 shrink-0 items-center justify-center rounded-tile bg-scope-soft text-sm font-bold text-scope-deep">
            <bdi>{group.initials}</bdi>
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <bdi className="truncate type-title text-fg">{group.name}</bdi>
            <span className="text-xs text-fg-secondary">
              {t(`roles.${group.myRole ?? "unknown"}`)} · {t("people", { count: group.memberCount ?? 0, n: group.memberCount === null ? t("common.notShown") : format.number(group.memberCount) })} · {t(`visibility.${group.visibility}`)}
            </span>
          </span>
        </div>
        {group.description ? <p className="line-clamp-2 text-sm text-fg-secondary">{group.description}</p> : null}
        <div className="mt-auto flex flex-wrap gap-1.5">
          {group.unread > 0 ? <span className="rounded-pill bg-scope-soft px-2.5 py-0.5 text-xs font-bold text-scope-deep">{t("home.unread", { n: format.number(group.unread) })}</span> : null}
          {group.pendingRequests > 0 ? <span className="rounded-pill bg-warning-soft px-2.5 py-0.5 text-xs font-bold text-warning-text">{t("groups.waiting", { n: format.number(group.pendingRequests) })}</span> : null}
        </div>
      </Link>
    </li>
  );
}

/** Admin list (SO-03, also SO-19 Requests): approve / decline. */
export function JoinRequestsCard({ groupId, groupName, bare = false }: { groupId: string; groupName?: string; bare?: boolean }) {
  const t = useTranslations("Social.groups");
  const format = useSocialFormat();
  const errorText = useSocialErrorText();
  const requests = useJoinRequests(groupId);
  const decide = useSocialMutation((repo, input: { id: string; approve: boolean }) => repo.groups.decide(input.id, input.approve));
  const list = requests.data ?? [];
  const body =
    list.length === 0 ? (
      <p className="rounded-row bg-subtle p-4 text-sm text-fg-secondary">{t("noRequests")}</p>
    ) : (
      <ul className="flex flex-col gap-2">
        {list.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-row bg-subtle px-3 py-2.5">
            <PersonAvatar person={r.person} />
            <span className="flex min-w-0 flex-1 flex-col">
              <bdi className="text-sm font-bold text-fg">{r.person.name}</bdi>
              {r.at ? <span className="text-xs text-fg-secondary">{format.relative(r.at)}</span> : null}
              {r.note ? <bdi className="mt-0.5 text-xs text-fg-muted">“{r.note}”</bdi> : null}
            </span>
            <span className="flex gap-1.5">
              <Button size="sm" variant="secondary" disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, approve: false }, { onSuccess: () => toast({ title: t("declined") }), onError: (e) => toast({ title: errorText(e), tone: "danger" }) })}>
                {t("decline")}
              </Button>
              <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, approve: true }, { onSuccess: () => toast({ title: t("approved", { name: r.person.name }), tone: "success" }), onError: (e) => toast({ title: errorText(e), tone: "danger" }) })}>
                {t("approve")}
              </Button>
            </span>
          </li>
        ))}
      </ul>
    );
  if (bare) return body;
  return (
    <ProductCard as="section" aria-label={`${t("requestsTitle")} · ${groupName ?? ""}`} className="flex flex-col gap-3">
      <SectionHead as="h3" title={t("requestsTitle")} end={<bdi className="truncate text-xs font-semibold text-fg-muted">{groupName}</bdi>} />
      {body}
    </ProductCard>
  );
}

function Discover() {
  const t = useTranslations("Social");
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<GroupTopic | "all">("all");
  const [asking, setAsking] = useState<GroupPreview | null>(null);
  const found = useDiscoverGroups(query, topic);
  const errorText = useSocialErrorText();
  const cancel = useSocialMutation((repo, groupId: string) => repo.groups.cancelJoin(groupId));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <SearchField aria-label={t("groups.search")} placeholder={t("groups.search")} value={query} onValueChange={setQuery} className="max-w-md" />
        {/* Live API: discover serves no topic → no topic filter. */}
        {found.data?.some((g) => g.topic === null) ? null : <PillGroup label={t("groups.topic")} value={topic} onValueChange={setTopic} options={TOPICS.map((value) => ({ value, label: t(`topics.${value}`) }))} />}
        <p className="text-xs text-fg-muted">{t("groups.discoverNote")}</p>
      </div>
      {found.isError ? <ErrorState onRetry={() => void found.refetch()} /> : null}
      {!found.data ? (
        found.isError ? null : <AccessLoading />
      ) : found.data.length === 0 ? (
        <EmptyState title={t("groups.noDiscover")} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {found.data.map((group) => (
            <li key={group.id}>
              <ProductCard as="article" aria-labelledby={`g-${group.id}`} className="flex h-full flex-col gap-2">
                <h2 id={`g-${group.id}`} className="type-title text-fg">
                  <bdi>{group.name}</bdi>
                </h2>
                <p className="text-xs font-semibold text-fg-secondary">
                  {t(`topics.${group.topic ?? "unknown"}`)} · {t("people", { count: group.size ?? 0, n: group.size === null ? t("common.notShown") : String(group.size) })}
                </p>
                <p className="text-sm text-fg-secondary">{group.description}</p>
                <div className="rounded-row bg-subtle p-3">
                  <p className="text-xs font-bold text-fg-muted uppercase">{t("groups.rules")}</p>
                  <p className="text-sm text-fg">{group.rules || t("groups.noRules")}</p>
                </div>
                <p className="text-xs text-fg-muted">{t("groups.previewNote")}</p>
                <div className="mt-auto pt-2">
                  {group.requested ? (
                    <div className="flex items-center gap-2">
                      <span className="rounded-pill bg-scope-soft px-3 py-1.5 text-xs font-bold text-scope-deep">{t("groups.requested")}</span>
                      <Button size="sm" variant="ghost" disabled={cancel.isPending} onClick={() => cancel.mutate(group.id, { onError: (e) => toast({ title: errorText(e), tone: "danger" }) })}>
                        {t("groups.cancelAsk")}
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" aria-haspopup="dialog" onClick={() => setAsking(group)}>
                      {t("groups.ask")}
                    </Button>
                  )}
                </div>
              </ProductCard>
            </li>
          ))}
        </ul>
      )}
      {asking ? <AskDialog group={asking} onClose={() => setAsking(null)} /> : null}
    </div>
  );
}

function AskDialog({ group, onClose }: { group: GroupPreview; onClose: () => void }) {
  const t = useTranslations("Social");
  const errorText = useSocialErrorText();
  const [note, setNote] = useState("");
  const ask = useSocialMutation((repo) => repo.groups.requestJoin(group.id, note));
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent title={t("groups.askTitle", { group: group.name })} description={t("groups.askHint")}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            ask.mutate(undefined, {
              onSuccess: () => {
                toast({ title: t("groups.requestSent"), tone: "success" });
                onClose();
              },
            });
          }}
        >
          <Field>
            <FieldLabel>{t("groups.askNote")}</FieldLabel>
            <Textarea dir="auto" value={note} onChange={(event) => setNote(event.target.value)} />
            <FieldDescription>{t("groups.previewNote")}</FieldDescription>
          </Field>
          {ask.isError ? <p className="text-sm font-semibold text-danger-text">{errorText(ask.error)}</p> : null}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={ask.isPending}>
              {t("groups.ask")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
