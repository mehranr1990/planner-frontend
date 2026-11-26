"use client";

import { Copy, Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import type { Circle, GroupDetail, GroupInviteLink } from "@/data/social-domain";
import { SocialError } from "@/data/social-repositories";
import { useBlocks, useExitCheck, useGroupLifecycle, useHandover, useInvitationPreview, useNotices, usePendingGroupInvitations, useSocialMutation, useSocialPurgeMutation } from "@/data/social-queries";
import { useSocialFormat } from "../format";
import { socialHref } from "../paths";
import { isUnsupported } from "../social-ui";
import { useSocialErrorText } from "../use-social";
import { PendingRow } from "./pending-invitations";

/*
 * Phase 6 server flows that the Mock-Mode screens did not model: blocks,
 * circle rename, invitation links (proof only in the URL fragment), invitation
 * response, ownership handover, exit check with second confirmation, owner
 * deletion with password re-entry, recovery, and the notice inbox. Passwords
 * and proofs live only in component state for the one call that needs them.
 */

const absolute = (href: string) => (typeof window === "undefined" ? href : new URL(href, window.location.origin).toString());

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast({ title: done, tone: "success" });
  } catch {
    toast({ title: text });
  }
}

// ── Connections: blocked list + circle rename ────────────────────────────

export function BlockedSection() {
  const t = useTranslations("Social.live");
  const errorText = useSocialErrorText();
  const blocks = useBlocks();
  const unblock = useSocialMutation((repo, id: string) => repo.blocks.unblock(id));
  if (blocks.isError) return isUnsupported(blocks.error) ? null : <InlineAlert tone="danger" title={errorText(blocks.error)} />;
  const rows = blocks.data ?? [];
  return (
    <section aria-labelledby="social-blocked" className="flex flex-col gap-2">
      <h3 id="social-blocked" className="text-sm font-bold text-fg">{t("blocked.title")}</h3>
      {rows.length === 0 ? <p className="text-sm text-fg-muted">{t("blocked.empty")}</p> : null}
      <ul className="flex flex-col gap-2">
        {rows.map((b, i) => (
          <li key={b.id} className="flex items-center gap-3 rounded-row bg-subtle px-3 py-2">
            <span className="min-w-0 flex-1 text-sm text-fg">{t("blocked.row", { n: i + 1 })}</span>
            <Button size="sm" variant="secondary" disabled={unblock.isPending} onClick={() => unblock.mutate(b.id, { onSuccess: () => toast({ title: t("blocked.done") }), onError: (e) => toast({ title: errorText(e), tone: "danger" }) })}>
              {t("blocked.unblock")}
            </Button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-fg-muted">{t("blocked.note")}</p>
    </section>
  );
}

export function CircleRename({ circle }: { circle: Circle }) {
  const t = useTranslations("Social.live");
  const errorText = useSocialErrorText();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(circle.name);
  const rename = useSocialMutation((repo, value: string) => repo.circles.rename(circle.id, value));
  if (!editing)
    return (
      <Button size="icon" variant="ghost" aria-label={t("circles.rename", { name: circle.name })} onClick={() => setEditing(true)}>
        <Icon icon={Pencil} size={16} />
      </Button>
    );
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        rename.mutate(name, { onSuccess: () => setEditing(false), onError: (err) => toast({ title: errorText(err), tone: "danger" }) });
      }}
    >
      <Input dir="auto" aria-label={t("circles.name")} value={name} onChange={(e) => setName(e.target.value)} className="h-9 w-40" />
      <Button size="sm" type="submit" disabled={!name.trim() || rename.isPending}>{t("save")}</Button>
      <Button size="sm" variant="ghost" type="button" onClick={() => setEditing(false)}>{t("cancel")}</Button>
    </form>
  );
}

// ── Invitations ──────────────────────────────────────────────────────────

/** Links to hand to invited people; the proof is in the fragment (never sent to a server log). */
export function InviteLinks({ links }: { links: GroupInviteLink[] }) {
  const t = useTranslations("Social.live");
  if (links.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-row bg-subtle p-3">
      <p className="text-sm font-semibold text-fg">{t("invite.linksTitle")}</p>
      <p className="text-xs text-fg-secondary">{t("invite.linksNote")}</p>
      <ul className="flex flex-col gap-1.5">
        {links.map((l, i) => (
          <li key={l.inviteId} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 text-sm">{t("invite.link", { n: i + 1 })}</span>
            {l.href ? (
              <Button size="sm" variant="secondary" onClick={() => void copy(absolute(l.href!), t("invite.copied"))}>
                <Icon icon={Copy} size={14} />
                {t("invite.copy")}
              </Button>
            ) : (
              <span className="text-xs text-warning-text">{t("invite.noProof")}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const noSubscribe = () => () => undefined;
/** In-memory only (never storage): the fragment's proof + issued revision, captured once per invitation for this page. */
const capturedLinks = new Map<string, { proof: string; revision: number } | null>();
function linkFromFragment(invitationId: string): { proof: string; revision: number } | null {
  if (!capturedLinks.has(invitationId)) {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const proof = params.get("proof");
    const rev = params.get("rev");
    capturedLinks.set(invitationId, proof && rev && /^[1-9]\d*$/.test(rev) ? { proof, revision: Number(rev) } : null);
  }
  return capturedLinks.get(invitationId)!;
}

/**
 * /social/invitations/[id]#proof=… — the recipient's explicit accept / decline.
 * Without a link proof (opened from the pending list or the bell) the screen
 * shows the pending invitation and answers it with a freshly rotated proof.
 */
export function InvitationScreen({ invitationId }: { invitationId: string }) {
  const t = useTranslations("Social.live");
  const errorText = useSocialErrorText();
  const router = useRouter();
  const format = useSocialFormat();
  const link = useSyncExternalStore(noSubscribe, () => linkFromFragment(invitationId), () => null);
  const proof = link?.proof ?? null;
  useEffect(() => {
    // Keep the proof out of the address bar and history once read (it is never sent in a URL).
    if (proof && window.location.hash) window.history.replaceState(null, "", window.location.pathname);
  }, [proof]);
  const preview = useInvitationPreview(invitationId, proof);
  const respond = useSocialPurgeMutation((repo, accept: boolean) => repo.invitations.respond(invitationId, link!.proof, link!.revision, accept));
  const pending = usePendingGroupInvitations(!proof);
  const listed = pending.data?.pages.flatMap((page) => page.items).find((item) => item.id === invitationId);
  if (!proof && ((pending.isPending && pending.fetchStatus !== "idle") || listed)) {
    return (
      <section className="mx-auto flex max-w-lg flex-col gap-4 p-4">
        <h1 className="type-title text-fg">{t("invitation.title")}</h1>
        {listed ? (
          <ul>
            <PendingRow row={listed} detailLink={false} />
          </ul>
        ) : null}
      </section>
    );
  }
  return (
    <section className="mx-auto flex max-w-lg flex-col gap-4 p-4">
      <h1 className="type-title text-fg">{t("invitation.title")}</h1>
      {!proof ? <InlineAlert tone="warning" title={t("invitation.noProof")} /> : null}
      {preview.isError ? <InlineAlert tone="danger" title={errorText(preview.error)} /> : null}
      {preview.data ? <p className="text-sm text-fg-secondary">{t("invitation.body", { until: format.relative(preview.data.expiresAt) })}</p> : null}
      {respond.isError ? <InlineAlert tone="danger" title={errorText(respond.error)} /> : null}
      <div className="flex gap-2">
        <Button
          disabled={!preview.data || respond.isPending}
          onClick={() => respond.mutate(true, { onSuccess: (r) => router.replace(r.groupId ? socialHref.group(r.groupId) : socialHref.home) })}
        >
          {t("invitation.accept")}
        </Button>
        <Button variant="secondary" disabled={!preview.data || respond.isPending} onClick={() => respond.mutate(false, { onSuccess: () => router.replace(socialHref.home) })}>
          {t("invitation.decline")}
        </Button>
      </div>
    </section>
  );
}

// ── Ownership handover ───────────────────────────────────────────────────

export function HandoverPanel({ groupId, handoverId }: { groupId: string; handoverId: string }) {
  const t = useTranslations("Social.live");
  const errorText = useSocialErrorText();
  const format = useSocialFormat();
  const router = useRouter();
  const handover = useHandover(groupId, handoverId);
  const [password, setPassword] = useState("");
  const respond = useSocialPurgeMutation((repo, input: { action: "accept" | "decline" | "revoke"; password?: string }) => repo.handovers.respond(groupId, handoverId, input.action, input.password));
  const h = handover.data;
  if (handover.isError) return <InlineAlert tone="danger" title={errorText(handover.error)} />;
  if (!h) return null;
  const done = () => {
    setPassword("");
    router.replace(socialHref.group(groupId));
  };
  return (
    <section className="flex flex-col gap-3 rounded-row bg-warning-soft p-4" aria-labelledby="handover-title">
      <h2 id="handover-title" className="text-sm font-bold text-fg">{t("handover.title")}</h2>
      <p className="text-sm text-fg-secondary">{h.state === "pending" ? t("handover.pending", { until: format.relative(h.expiresAt) }) : t(`handover.state.${h.state}`)}</p>
      {respond.isError ? <InlineAlert tone="danger" title={errorText(respond.error)} /> : null}
      {h.state === "pending" && h.toMe ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            respond.mutate({ action: "accept", password }, { onSuccess: done, onSettled: () => setPassword("") });
          }}
        >
          <Field className="min-w-48 flex-1">
            <FieldLabel>{t("password")}</FieldLabel>
            <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <FieldDescription>{t("handover.passwordNote")}</FieldDescription>
          </Field>
          <Button type="submit" disabled={!password || respond.isPending}>{t("handover.accept")}</Button>
          <Button type="button" variant="secondary" disabled={respond.isPending} onClick={() => respond.mutate({ action: "decline" }, { onSuccess: done })}>{t("handover.decline")}</Button>
        </form>
      ) : null}
      {h.state === "pending" && h.fromMe ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => void copy(absolute(socialHref.group(groupId) + `?handover=${encodeURIComponent(handoverId)}`), t("invite.copied"))}>{t("handover.copy")}</Button>
          <Button size="sm" variant="ghost" disabled={respond.isPending} onClick={() => respond.mutate({ action: "revoke" }, { onSuccess: done })}>{t("handover.revoke")}</Button>
        </div>
      ) : null}
    </section>
  );
}

// ── Leave · delete · recover ─────────────────────────────────────────────

export function LiveLeave({ group }: { group: GroupDetail }) {
  const t = useTranslations("Social.live");
  const format = useSocialFormat();
  const router = useRouter();
  const errorText = useSocialErrorText();
  const check = useExitCheck(group.id);
  const [step, setStep] = useState<"none" | "first" | "second" | "delete">("none");
  const [understood, setUnderstood] = useState(false);
  const [password, setPassword] = useState("");
  const [successor, setSuccessor] = useState("");
  const [handoverHref, setHandoverHref] = useState<string | null>(null);
  const leave = useSocialPurgeMutation((repo, confirmation: string | null) => repo.exit.leave(group.id, confirmation));
  const del = useSocialPurgeMutation((repo, input: { password: string; confirmation: string | null }) => repo.exit.deleteGroup(group.id, input.password, input.confirmation));
  const start = useSocialMutation((repo, personId: string) => repo.handovers.start(group.id, personId));
  const c = check.data;
  if (check.isError) return <InlineAlert tone="danger" title={errorText(check.error)} />;
  if (!c) return null;
  const owing = c.obligations.length > 0;
  const isOwner = group.myRole === "owner";
  const others = group.members.filter((m) => !m.isSelf);
  const close = () => {
    setStep("none");
    setUnderstood(false);
    setPassword("");
  };
  const doLeave = (confirmation: string | null) =>
    leave.mutateAsync(confirmation).then(
      () => {
        toast({ title: t("exit.left", { group: group.name }) });
        router.replace(socialHref.home);
      },
      (error: unknown) => {
        // A balance or membership changed since the check: refresh it and ask again.
        if (error instanceof SocialError && error.reason === "OUTSTANDING_BALANCE_CONFIRMATION_REQUIRED") void check.refetch();
        throw error;
      },
    );
  return (
    <div className="flex flex-col gap-4 p-1">
      <h3 className="text-sm font-bold text-fg">{t("exit.obligations")}</h3>
      {owing ? (
        <ul className="flex flex-col gap-2">
          {c.obligations.map((o) => (
            <li key={`${o.ledger.kind}:${o.ledger.id}:${o.currency}`} className="flex flex-wrap items-center gap-2 rounded-row bg-warning-soft px-3 py-2 text-sm">
              <span className="min-w-0 flex-1">{t(`exit.ledger.${o.ledger.kind}`)}</span>
              <span dir="ltr" className="font-semibold tabular-nums">{o.net !== null && (o.currency === "irr" || o.currency === "try" || o.currency === "eur") ? format.signed(o.net, o.currency) : `${o.net ?? "—"} ${o.currency}`}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-secondary">{t("exit.noObligations")}</p>
      )}
      <p className="text-xs text-fg-muted">{t("exit.note")}</p>

      {isOwner ? (
        <div className="flex flex-col gap-3 rounded-row bg-warning-soft p-4">
          <p className="text-sm font-semibold text-warning-text">{t("exit.ownerFirst")}</p>
          {group.capabilities.transferOwnership ? (
            <div className="flex flex-wrap items-end gap-2">
              <Field className="min-w-48 flex-1">
                <FieldLabel>{t("exit.successor")}</FieldLabel>
                <Select value={successor} onValueChange={setSuccessor} placeholder={t("exit.successor")}>
                  {others.map((m) => <SelectItem key={m.person.id} value={m.person.id}>{m.person.name || "—"}</SelectItem>)}
                </Select>
              </Field>
              <Button variant="secondary" disabled={!successor || start.isPending} onClick={() => start.mutate(successor, { onSuccess: (r) => setHandoverHref(r.href), onError: (e) => toast({ title: errorText(e), tone: "danger" }) })}>
                {t("exit.startHandover")}
              </Button>
            </div>
          ) : null}
          {handoverHref ? (
            <Button size="sm" variant="secondary" className="self-start" onClick={() => void copy(absolute(handoverHref), t("invite.copied"))}>
              <Icon icon={Copy} size={14} />
              {t("handover.copy")}
            </Button>
          ) : null}
        </div>
      ) : (
        <Button variant="destructive" className="self-start" aria-haspopup="dialog" onClick={() => setStep("first")}>{t("exit.leave")}</Button>
      )}

      {c.deletion ? (
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <p className="text-sm text-fg-secondary">{t("exit.deleteBody")}</p>
          {c.deletion.outstandingLedgerCount > 0 ? <p className="text-xs font-semibold text-warning-text">{t("exit.deleteOutstanding", { ledgers: c.deletion.outstandingLedgerCount, people: c.deletion.outstandingPartyCount })}</p> : null}
          <Button variant="ghost" className="self-start text-danger-text" aria-haspopup="dialog" onClick={() => setStep("delete")}>{t("exit.delete")}</Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={step === "first"}
        onOpenChange={(open) => (open ? undefined : close())}
        tone="destructive"
        title={t("exit.confirmTitle", { group: group.name })}
        description={owing ? t("exit.owingWarning") : t("exit.leaveBody")}
        confirmLabel={owing ? t("exit.continue") : t("exit.leave")}
        error={leave.isError ? errorText(leave.error) : undefined}
        onConfirm={() => (owing ? setStep("second") : doLeave(null))}
      />
      <ConfirmDialog
        open={step === "second"}
        onOpenChange={(open) => (open ? undefined : close())}
        tone="destructive"
        title={t("exit.secondTitle")}
        description={
          <span className="flex flex-col gap-3">
            <span>{t("exit.secondBody")}</span>
            <Checkbox checked={understood} onCheckedChange={(v) => setUnderstood(v === true)} label={t("exit.understood")} />
          </span>
        }
        confirmLabel={t("exit.leave")}
        error={leave.isError ? errorText(leave.error) : undefined}
        onConfirm={() => (understood ? doLeave(c.departureConfirmation) : Promise.reject(new SocialError("invalid")))}
      />
      <ConfirmDialog
        open={step === "delete"}
        onOpenChange={(open) => (open ? undefined : close())}
        tone="destructive"
        title={t("exit.delete")}
        description={
          <span className="flex flex-col gap-3">
            <span>{t("exit.deleteConfirm")}</span>
            <Field>
              <FieldLabel>{t("password")}</FieldLabel>
              <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {c.deletion && c.deletion.outstandingLedgerCount > 0 ? <Checkbox checked={understood} onCheckedChange={(v) => setUnderstood(v === true)} label={t("exit.understood")} /> : null}
          </span>
        }
        confirmLabel={t("exit.delete")}
        error={del.isError ? errorText(del.error) : undefined}
        onConfirm={() => {
          const needs = !!c.deletion && c.deletion.outstandingLedgerCount > 0;
          if (!password || (needs && !understood)) return Promise.reject(new SocialError("invalid"));
          return del
            .mutateAsync({ password, confirmation: needs ? c.deletion!.confirmation : null })
            .then(() => {
              toast({ title: t("exit.deleted") });
              router.replace(`/social/recover/${encodeURIComponent(group.id)}`);
            })
            .finally(() => setPassword(""));
        }}
      />
    </div>
  );
}

/** /social/recover/[id] — the former primary owner's recovery until the server's `recoveryDeadline` (7 days for new deletions, ADR 0069). */
export function RecoveryScreen({ groupId }: { groupId: string }) {
  const t = useTranslations("Social.live");
  const errorText = useSocialErrorText();
  const format = useSocialFormat();
  const router = useRouter();
  const job = useGroupLifecycle(groupId);
  const [password, setPassword] = useState("");
  const recover = useSocialPurgeMutation((repo, value: string) => repo.exit.recover(groupId, value));
  const j = job.data;
  return (
    <section className="mx-auto flex max-w-lg flex-col gap-4 p-4">
      <h1 className="type-title text-fg">{t("recover.title")}</h1>
      {job.isError ? <InlineAlert tone="danger" title={errorText(job.error)} /> : null}
      {j ? (
        <>
          <p className="text-sm text-fg-secondary">{t(`recover.state.${j.state}`)}</p>
          {j.state === "BLOCKED_POLICY" ? <InlineAlert tone="info" title={t("recover.blockedPolicy")} /> : null}
          {!j.recoverable && (j.state === "CLOSING_GRACE" || j.state === "OWNER_EXIT_FROZEN") ? <InlineAlert tone="info" title={t("recover.expired", { when: format.relative(j.recoveryDeadline) })} /> : null}
          {j.recoverable ? (
            <>
              <InlineAlert tone="warning" title={t("recover.deadline", { when: format.relative(j.recoveryDeadline) })} />
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  recover.mutate(password, {
                    onSuccess: () => {
                      toast({ title: t("recover.done"), tone: "success" });
                      router.replace(socialHref.group(groupId));
                    },
                    onSettled: () => setPassword(""),
                  });
                }}
              >
                <Field>
                  <FieldLabel>{t("password")}</FieldLabel>
                  <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                  <FieldDescription>{t("recover.note")}</FieldDescription>
                </Field>
                {recover.isError ? <InlineAlert tone="danger" title={errorText(recover.error)} /> : null}
                <Button type="submit" className="self-start" disabled={!password || recover.isPending}>{t("recover.action")}</Button>
              </form>
            </>
          ) : null}
        </>
      ) : null}
      <Button asChild variant="ghost" className="self-start"><Link href={socialHref.balances}>{t("recover.balances")}</Link></Button>
    </section>
  );
}

// ── Notices ──────────────────────────────────────────────────────────────

export function NoticesCard() {
  const t = useTranslations("Social.live");
  const format = useSocialFormat();
  const notices = useNotices();
  const read = useSocialMutation((repo, id: string) => repo.notices.read(id));
  if (notices.isError || !notices.data) return null;
  const rows = notices.data.slice(0, 12);
  const unread = notices.data.filter((n) => !n.read).length;
  return (
    <section aria-labelledby="social-notices" className="flex flex-col gap-2">
      <h2 id="social-notices" className="text-sm font-bold text-fg">
        {t("notices.title")} {unread > 0 ? <span className="ms-1 rounded-pill bg-scope-soft px-2 text-xs text-scope-deep">{format.number(unread)}</span> : null}
      </h2>
      {rows.length === 0 ? <p className="text-sm text-fg-muted">{t("notices.empty")}</p> : null}
      <ul className="flex flex-col gap-1.5">
        {rows.map((n) => (
          <li key={n.id} className="flex items-center gap-2 rounded-row bg-subtle px-3 py-2">
            <Link href={n.href} className="min-w-0 flex-1 text-sm text-fg underline-offset-2 hover:underline" onClick={() => (n.read ? undefined : read.mutate(n.id))}>
              <span className={n.read ? "text-fg-secondary" : "font-semibold"}>{t(noticeKey(n.kind, (k) => t.has(k)))}</span>
            </Link>
            <span className="text-xs text-fg-muted">{format.relative(n.at)}</span>
            {!n.read ? (
              <Button size="sm" variant="ghost" onClick={() => read.mutate(n.id)}>{t("notices.markRead")}</Button>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="text-xs text-fg-muted">{t("notices.note")}</p>
    </section>
  );
}

/** Copy key for a notice kind; unknown kinds (a newer server) fall back to a generic label. */
function noticeKey(kind: string, has: (key: never) => boolean): "notices.kind.other" {
  const key = `notices.kind.${kind}`;
  return (has(key as never) ? key : "notices.kind.other") as "notices.kind.other";
}
