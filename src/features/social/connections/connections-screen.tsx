"use client";

import { MessageCircle, Plus, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { EmptyState, ErrorState } from "@/components/feedback/state-views";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { PillGroup } from "@/components/ui/pills";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SearchField } from "@/components/ui/search-field";
import { toast } from "@/components/ui/toast";
import type { Connection, RequestPrivacy } from "@/data/social-domain";
import { useBalanceBetween, useCircles, useConnectionRequests, useConnections, useRequestPrivacy, useSocialMutation } from "@/data/social-queries";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import { UtilityCard } from "@/design-system/surfaces/utility-card";
import { cn } from "@/lib/cn";
import { useSocialFormat } from "../format";
import { useOpenDirectMessage } from "../group/group-chat";
import { useOpenSocialSheet } from "../sheets/social-sheet-params";
import { PersonAvatar, SectionHead, SocialPageHeader, SocialUnsupported } from "../social-ui";
import { useSocialErrorText } from "../use-social";

/*
 * SO-02 · Connections & circles (/social/connections). Mutual connections,
 * independent of groups and work. Requests: Accept / Ignore (silent, resend
 * blocked 30 days, S2). Circles are private labels only I see (filter,
 * invite, free/busy). Connection signature card: notch = Message (direct
 * conversation in Messages); shared groups and the net balance between us
 * from approved shared expenses, per currency. Privacy: who may send
 * requests. Remove = silent; Block = no requests, DMs, presence, mentions.
 */
export function ConnectionsScreen() {
  const t = useTranslations("Social.connections");
  const openSheet = useOpenSocialSheet();
  const connections = useConnections();
  const requests = useConnectionRequests();
  const circles = useCircles();
  const [circle, setCircle] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | undefined>();

  const header = (
    <SocialPageHeader
      trail={[{ label: t("title") }]}
      title={t("title")}
      subtitle={t("subtitle")}
      actions={
        <Button className="gap-2" aria-haspopup="dialog" onClick={() => openSheet("connect")}>
          <Icon icon={UserPlus} size={16} />
          {t("connect")}
        </Button>
      }
    />
  );
  if (connections.isError) {
    return (
      <>
        {header}
        <ErrorState onRetry={() => void connections.refetch()} />
      </>
    );
  }
  if (!connections.data || !requests.data || !circles.data) {
    return (
      <>
        {header}
        <AccessLoading />
      </>
    );
  }
  const needle = query.trim().toLocaleLowerCase();
  const list = connections.data.filter((c) => (circle === "all" || c.circleIds.includes(circle)) && (!needle || c.person.name.toLocaleLowerCase().includes(needle)));
  const selected = connections.data.find((c) => c.person.id === selectedId) ?? list[0];

  return (
    <>
      {header}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="flex min-w-0 flex-col gap-4">
          {requests.data.length > 0 ? <RequestsCard /> : null}
          <ProductCard as="section" aria-labelledby="connections-list" className="flex flex-col gap-3">
            <SectionHead id="connections-list" title={t("title")} />
            {connections.data.length === 0 ? (
              <EmptyState title={t("empty.title")} description={t("empty.body")} primaryAction={<Button onClick={() => openSheet("connect")}>{t("connect")}</Button>} />
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  <PillGroup label={t("circles")} value={circle} onValueChange={setCircle} options={[{ value: "all", label: t("allCircles") }, ...circles.data.map((c) => ({ value: c.id, label: c.name }))]} />
                  <p className="text-xs text-fg-muted">{t("circlesHint")}</p>
                </div>
                <SearchField aria-label={t("search")} placeholder={t("search")} value={query} onValueChange={setQuery} />
                {list.length === 0 ? <p className="rounded-row bg-subtle p-4 text-sm text-fg-secondary">{t("noMatch")}</p> : null}
                <ul className="flex flex-col gap-1.5">
                  {list.map((c) => (
                    <li key={c.person.id}>
                      <button
                        type="button"
                        aria-pressed={selected?.person.id === c.person.id}
                        onClick={() => setSelectedId(c.person.id)}
                        className={cn("flex min-h-14 w-full items-center gap-3 rounded-row px-3 py-2 text-start transition-colors", selected?.person.id === c.person.id ? "bg-scope-soft" : "bg-subtle hover:bg-raised")}
                      >
                        <PersonAvatar person={c.person} />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <bdi className="truncate text-sm font-bold text-fg">{c.person.name}</bdi>
                          <span className="truncate text-xs text-fg-secondary">
                            {c.circleIds.map((id) => circles.data.find((x) => x.id === id)?.name).filter(Boolean).join(" · ")}
                            {c.sharedGroups && c.sharedGroups.length > 0 ? `${c.circleIds.length > 0 ? " · " : ""}${c.sharedGroups.map((g) => g.name).join(", ")}` : ""}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </ProductCard>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          {selected ? <ConnectionCard key={selected.person.id} connection={selected} /> : null}
          <CirclesCard />
          <PrivacyCard />
        </div>
      </div>
    </>
  );
}

function RequestsCard() {
  const t = useTranslations("Social.connections");
  const format = useSocialFormat();
  const errorText = useSocialErrorText();
  const requests = useConnectionRequests();
  const decide = useSocialMutation((repo, input: { id: string; action: "accept" | "ignore" | "cancel" }) =>
    input.action === "accept" ? repo.connections.accept(input.id) : input.action === "ignore" ? repo.connections.ignore(input.id) : repo.connections.cancel(input.id),
  );
  const run = (id: string, action: "accept" | "ignore" | "cancel", name: string) =>
    decide.mutate({ id, action }, { onSuccess: () => (action === "accept" ? toast({ title: t("accepted", { name }), tone: "success" }) : undefined), onError: (error) => toast({ title: errorText(error), tone: "danger" }) });
  const list = requests.data ?? [];
  return (
    <ProductCard as="section" aria-labelledby="requests" className="flex flex-col gap-3">
      <SectionHead id="requests" title={t("requests")} end={<span className="text-sm font-bold text-fg-muted tabular">{format.number(list.length)}</span>} />
      <ul className="flex flex-col gap-2">
        {list.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-row bg-subtle px-3 py-2.5">
            <PersonAvatar person={r.person} />
            <span className="flex min-w-0 flex-1 flex-col">
              <bdi className="text-sm font-bold text-fg">{r.person.name}</bdi>
              <span className="text-xs text-fg-secondary">
                {r.direction === "incoming" ? r.mutualGroups === null ? t("incoming") : `${t("incoming")} · ${t("mutualGroups", { count: r.mutualGroups, n: format.number(r.mutualGroups) })}` : t("outgoing")}
              </span>
              {r.note ? <bdi className="mt-0.5 text-xs text-fg-muted">“{r.note}”</bdi> : null}
            </span>
            {r.direction === "incoming" ? (
              <span className="flex gap-1.5">
                <Button size="sm" variant="secondary" title={t("ignoreHint")} disabled={decide.isPending} onClick={() => run(r.id, "ignore", r.person.name)}>
                  {t("ignore")}
                </Button>
                <Button size="sm" disabled={decide.isPending} onClick={() => run(r.id, "accept", r.person.name)}>
                  {t("accept")}
                </Button>
              </span>
            ) : (
              <Button size="sm" variant="ghost" disabled={decide.isPending} onClick={() => run(r.id, "cancel", r.person.name)}>
                {t("cancelRequest")}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-fg-muted">{t("ignoreHint")}</p>
    </ProductCard>
  );
}

function ConnectionCard({ connection }: { connection: Connection }) {
  const t = useTranslations("Social.connections");
  const tCommon = useTranslations("Social.common");
  const format = useSocialFormat();
  const message = useOpenDirectMessage();
  const between = useBalanceBetween(connection.person.id);
  const circles = useCircles();
  const errorText = useSocialErrorText();
  const [confirm, setConfirm] = useState<"remove" | "block" | null>(null);
  const setCircle = useSocialMutation((repo, input: { circleId: string; member: boolean }) => repo.circles.setMembership(input.circleId, connection.person.id, input.member));
  const end = useSocialMutation((repo, action: "remove" | "block") => (action === "remove" ? repo.connections.remove(connection.person.id) : repo.connections.block(connection.person.id)));
  const name = connection.person.name;
  return (
    <SignatureCard as="section" aria-labelledby="connection-name" contentClassName="flex flex-col gap-4" action={<SignatureCardAction label={tCommon("message")} icon={MessageCircle} onClick={() => void message(connection.person.id)} />}>
      <div className="flex items-center gap-3 pe-16">
        <PersonAvatar person={connection.person} size={48} />
        <div className="flex min-w-0 flex-col">
          <h2 id="connection-name" className="type-h2 text-fg">
            <bdi>{name}</bdi>
          </h2>
          <span className="text-xs text-fg-secondary">{t("since", { date: format.day(connection.since, "full") })}</span>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-xs font-bold tracking-wide text-fg-muted uppercase">{t("sharedGroups")}</h3>
        <p className="text-sm text-fg">{connection.sharedGroups === null ? t("sharedUnknown") : connection.sharedGroups.length > 0 ? connection.sharedGroups.map((g) => g.name).join(" · ") : t("noShared")}</p>
      </div>
      <div className="flex flex-col gap-1.5 rounded-row bg-subtle p-3">
        <h3 className="text-xs font-bold tracking-wide text-fg-muted uppercase">{t("between")}</h3>
        {between.isError ? (
          <SocialUnsupported compact />
        ) : (between.data ?? []).length === 0 ? (
          <p className="text-sm text-fg-secondary">{t("betweenNone")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {between.data!.map((b) => (
              <li key={b.currency} className={cn("text-sm font-bold tabular", b.net > 0 ? "text-success-text" : "text-danger-text")}>
                {b.net > 0 ? t("owesYou", { amount: format.money(b.net, b.currency) }) : t("youOwe", { amount: format.money(-b.net, b.currency) })}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-fg-muted">{t("betweenNote")}</p>
      </div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-xs font-bold tracking-wide text-fg-muted uppercase">{t("editCircles", { name })}</legend>
        {(circles.data ?? []).map((c) => (
          <Checkbox key={c.id} checked={connection.circleIds.includes(c.id)} onCheckedChange={(checked) => setCircle.mutate({ circleId: c.id, member: checked === true })} label={c.name} />
        ))}
      </fieldset>
      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        <Button size="sm" variant="ghost" onClick={() => setConfirm("remove")}>
          {t("remove")}
        </Button>
        <Button size="sm" variant="ghost" className="text-danger-text" onClick={() => setConfirm("block")}>
          {t("block")}
        </Button>
      </div>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => (open ? undefined : setConfirm(null))}
        title={confirm === "block" ? t("block") : t("remove")}
        description={confirm === "block" ? t("blockBody", { name }) : t("removeBody", { name })}
        confirmLabel={confirm === "block" ? t("block") : t("remove")}
        tone={confirm === "block" ? "destructive" : "default"}
        error={end.isError ? errorText(end.error) : undefined}
        onConfirm={() =>
          end.mutateAsync(confirm ?? "remove").then(() => {
            toast({ title: confirm === "block" ? t("blocked", { name }) : t("removed") });
            setConfirm(null);
          })
        }
      />
    </SignatureCard>
  );
}

function CirclesCard() {
  const t = useTranslations("Social.connections");
  const circles = useCircles();
  const [name, setName] = useState("");
  const create = useSocialMutation((repo, value: string) => repo.circles.create(value));
  return (
    <UtilityCard as="section" aria-labelledby="circles" className="flex flex-col gap-3">
      <SectionHead id="circles" as="h3" title={t("circles")} />
      <p className="text-xs text-fg-secondary">{t("circlesHint")}</p>
      <ul className="flex flex-wrap gap-1.5">
        {(circles.data ?? []).map((c) => (
          <li key={c.id} className="rounded-pill bg-surface px-3 py-1 text-xs font-semibold text-fg">
            {c.name}
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          create.mutate(name, { onSuccess: () => setName("") });
        }}
      >
        <Input aria-label={t("circleName")} placeholder={t("newCircle")} dir="auto" value={name} onChange={(event) => setName(event.target.value)} className="h-10" />
        <Button type="submit" size="sm" variant="secondary" className="gap-1" disabled={create.isPending}>
          <Icon icon={Plus} size={14} />
          {t("addCircle")}
        </Button>
      </form>
    </UtilityCard>
  );
}

function PrivacyCard() {
  const t = useTranslations("Social.connections.privacy");
  const privacy = useRequestPrivacy();
  const save = useSocialMutation((repo, value: RequestPrivacy) => repo.connections.setPrivacy(value));
  if (!privacy.data) return null;
  return (
    <UtilityCard as="section" aria-labelledby="privacy" className="flex flex-col gap-3">
      <h3 id="privacy" className="type-title text-fg">
        {t("title")}
      </h3>
      <RadioGroup aria-labelledby="privacy" value={privacy.data} onValueChange={(value) => save.mutate(value as RequestPrivacy)}>
        <RadioGroupItem value="everyone" label={t("everyone")} />
        <RadioGroupItem value="groups" label={t("groups")} />
        <RadioGroupItem value="nobody" label={t("nobody")} />
      </RadioGroup>
    </UtilityCard>
  );
}
