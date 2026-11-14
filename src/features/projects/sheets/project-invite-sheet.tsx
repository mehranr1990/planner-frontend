"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, type KeyboardEvent } from "react";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { toast } from "@/components/ui/toast";
import type { InviteRole } from "@/data/project-domain";
import { useInviteActions, usePendingInvites } from "@/data/project-queries";
import { RepositoryError } from "@/data/repositories";
import { cn } from "@/lib/cn";
import { useProjectFormat } from "../format";
import { useCurrentProjectAccess } from "../use-current-project";

/*
 * ?sheet=project-invite (PJ-90): emails as chips, roles with descriptions,
 * the verified-only line (never reveals whether an account exists — every
 * email gets the same answer), pending invitations with Resend / Cancel
 * (Undo restores). Admin is offered only to Owners; Task-only access is the
 * verified external collaborator with a narrow grant.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ProjectInviteSheet({ onDone }: { onDone: () => void }) {
  const t = useTranslations("Projects.sheets");
  const format = useProjectFormat();
  const { project, capabilities } = useCurrentProjectAccess();
  const projectId = project?.id ?? "";
  const pending = usePendingInvites(project?.id);
  const actions = useInviteActions(projectId);
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [role, setRole] = useState<InviteRole>("member");
  const [invalid, setInvalid] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const inputId = useId();
  const roleLabelId = useId();

  if (!project || !capabilities) return null;
  if (!capabilities.invite) return <InlineAlert tone="info" title={t("invite.noRight")} />;

  const roles: InviteRole[] = [
    ...(project.role === "owner" ? (["admin"] as const) : []),
    "manager",
    "member",
    "viewer",
    "guest",
  ];

  const commit = (text: string) => {
    const parts = text
      .split(/[\s,;]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    setEmails((current) => [...new Set([...current, ...parts])]);
    setDraft("");
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === "," || event.key === " ") {
      if (draft.trim()) {
        event.preventDefault();
        commit(draft);
      }
    } else if (event.key === "Backspace" && !draft && emails.length > 0) {
      setEmails((current) => current.slice(0, -1));
    }
  };

  const send = () => {
    const all = draft.trim() ? [...emails, ...draft.split(/[\s,;]+/).filter(Boolean)] : emails;
    if (all.length === 0 || all.some((email) => !EMAIL.test(email))) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setFailure(null);
    actions.send.mutate(
      { emails: all, role },
      {
        onSuccess: (sent) => {
          toast({
            title: t("invite.sent", { n: sent.length }),
            action: {
              label: t("invite.undo"),
              altText: t("invite.undoAlt"),
              onClick: () => {
                for (const invite of sent) actions.cancel.mutate(invite.id);
              },
            },
          });
          setEmails([]);
          setDraft("");
          onDone();
        },
        onError: (cause) => {
          if (cause instanceof RepositoryError && cause.code === "partial" && cause.failedIds) {
            // Some were sent: keep only the unsent emails (nothing is resent automatically).
            setEmails([...cause.failedIds]);
            setDraft("");
            setFailure(t("invite.partial", { n: all.length - cause.failedIds.length }));
          } else if (cause instanceof RepositoryError && cause.code === "unsupported")
            setFailure(t(cause.message === "guest-role" ? "invite.guestUnavailable" : "invite.unavailable"));
          else if (cause instanceof RepositoryError && cause.code === "invalid") setInvalid(true);
          else setFailure(t("invite.failed"));
        },
      },
    );
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-sm font-bold text-fg">
          {t("invite.emails")}
        </label>
        <div className="flex min-h-12 flex-wrap items-center gap-1.5 rounded-field bg-subtle px-2 py-1.5">
          {emails.map((email) => (
            <span
              key={email}
              className="inline-flex items-center gap-1 rounded-pill bg-surface py-1 ps-2.5 pe-1 text-xs font-semibold text-fg"
            >
              <bdi dir="ltr">{email}</bdi>
              <button
                type="button"
                aria-label={t("invite.removeEmail", { email })}
                onClick={() => setEmails((current) => current.filter((item) => item !== email))}
                className="inline-flex size-5 items-center justify-center rounded-full hover:bg-subtle"
              >
                <Icon icon={X} size={12} />
              </button>
            </span>
          ))}
          <input
            id={inputId}
            type="email"
            dir="ltr"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            onBlur={() => commit(draft)}
            placeholder={t("invite.addEmail")}
            className="min-h-9 min-w-40 flex-1 bg-transparent px-1 text-sm text-fg outline-none placeholder:text-fg-muted"
          />
        </div>
      </div>

      <div role="radiogroup" aria-labelledby={roleLabelId} className="flex flex-col gap-1.5">
        <p id={roleLabelId} className="text-sm font-bold text-fg">
          {t("invite.role")}
        </p>
        {roles.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={role === value}
            onClick={() => setRole(value)}
            className={cn(
              "flex flex-col items-start gap-0.5 rounded-row px-3.5 py-2.5 text-start transition-colors",
              role === value ? "bg-surface ring-[1.5px] ring-primary" : "bg-subtle hover:bg-raised",
            )}
          >
            <span className="text-sm font-bold text-fg">{t(`invite.roles.${value}.label`)}</span>
            <span className="text-xs font-medium text-fg-secondary">{t(`invite.roles.${value}.description`)}</span>
          </button>
        ))}
      </div>

      <p className="text-xs text-fg-secondary">{t("invite.verified")}</p>
      {invalid ? <InlineAlert tone="danger" title={t("invite.invalid")} /> : null}
      {failure ? <InlineAlert tone="danger" title={failure} /> : null}

      {pending.data && pending.data.length > 0 ? (
        <section
          aria-label={t("invite.pending", { n: format.number(pending.data.length) })}
          className="flex flex-col gap-1.5"
        >
          <p className="text-[0.6875rem] font-bold tracking-wide text-fg-secondary uppercase">
            {t("invite.pending", { n: format.number(pending.data.length) })}
          </p>
          <ul className="flex flex-col">
            {pending.data.map((invite) => (
              <li key={invite.id} className="flex min-h-10 flex-wrap items-center gap-2 text-sm">
                <bdi dir="ltr" className="min-w-0 flex-1 truncate font-semibold text-fg">
                  {invite.email}
                </bdi>
                <span className="text-xs text-fg-secondary">
                  {t("invite.pendingMeta", {
                    role: t(`invite.roles.${invite.role}.label`),
                    time: format.relative(invite.sentAt),
                  })}
                </span>
                <button
                  type="button"
                  className="text-xs font-bold text-fg underline underline-offset-2"
                  onClick={() =>
                    actions.resend.mutate(invite.id, {
                      onSuccess: () => toast({ title: t("invite.resent", { email: invite.email }) }),
                    })
                  }
                >
                  {t("invite.resend")}
                </button>
                <button
                  type="button"
                  className="text-xs font-bold text-danger-text underline underline-offset-2"
                  onClick={() =>
                    actions.cancel.mutate(invite.id, {
                      onSuccess: () =>
                        toast({
                          title: t("invite.cancelled", { email: invite.email }),
                          action: {
                            label: t("invite.undo"),
                            altText: t("invite.undoAlt"),
                            onClick: () => actions.restore.mutate(invite),
                          },
                        }),
                    })
                  }
                >
                  {t("invite.cancelInvite")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={actions.send.isPending}>
          {t("invite.submit")}
        </Button>
      </div>
    </form>
  );
}
