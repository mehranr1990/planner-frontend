"use client";

import { LockKeyhole, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, type KeyboardEvent } from "react";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { toast } from "@/components/ui/toast";
import type { TeamInviteInput } from "@/data/team-repositories";
import { useSendTeamInvites } from "@/data/team-queries";
import { cn } from "@/lib/cn";
import { useCurrentTeamAccess } from "../use-current-team";

/*
 * ?sheet=team-invite (TM-90): emails as chips; roles Admin / Lead / Member /
 * Viewer with their one-line scope (Owner only by transfer; Admin offered to
 * Owners only); the explicit note that joining does not give access to the
 * team's projects; the verified-only line that never reveals whether an
 * account exists (every address gets the same answer).
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function TeamInviteSheet({ onDone }: { onDone: () => void }) {
  const t = useTranslations("TeamInvite");
  const { team, capabilities } = useCurrentTeamAccess();
  const send = useSendTeamInvites(team?.id ?? "");
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [role, setRole] = useState<TeamInviteInput["role"]>("member");
  const [invalid, setInvalid] = useState(false);
  const inputId = useId();
  const roleLabelId = useId();

  if (!team || !capabilities) return null;
  if (!capabilities.invite) return <InlineAlert tone="info" title={t("noRight")} />;

  const roles: TeamInviteInput["role"][] = [...(capabilities.inviteAdmin ? (["admin"] as const) : []), "lead", "member", "viewer"];

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

  const submit = () => {
    const all = draft.trim() ? [...emails, ...draft.split(/[\s,;]+/).filter(Boolean)] : emails;
    if (all.length === 0 || all.some((email) => !EMAIL.test(email))) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    send.mutate(
      { emails: all, role },
      {
        onSuccess: ({ sent }) => {
          toast({ title: t("sent", { n: sent }) });
          onDone();
        },
        onError: () => setInvalid(true),
      },
    );
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-sm font-bold text-fg">
          {t("emails")}
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
                aria-label={t("removeEmail", { email })}
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
            placeholder={t("addEmail")}
            className="min-h-9 min-w-40 flex-1 bg-transparent px-1 text-sm text-fg outline-none placeholder:text-fg-muted"
          />
        </div>
      </div>

      <div role="radiogroup" aria-labelledby={roleLabelId} className="flex flex-col gap-1.5">
        <p id={roleLabelId} className="text-sm font-bold text-fg">
          {t("role")}
        </p>
        {roles.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={role === value}
            onClick={() => setRole(value)}
            className={cn(
              "grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-2 rounded-row px-3.5 py-2.5 text-start transition-colors",
              role === value ? "bg-surface ring-[1.5px] ring-primary" : "bg-subtle hover:bg-raised",
            )}
          >
            <span className="text-sm font-bold text-fg">{t(`roles.${value}.label`)}</span>
            <span className="text-xs font-medium text-fg-secondary">{t(`roles.${value}.description`)}</span>
          </button>
        ))}
      </div>

      <div role="note" className="flex items-start gap-2 rounded-row bg-warning-soft px-3.5 py-3 text-xs font-semibold text-warning-text">
        <Icon icon={LockKeyhole} size={14} className="mt-0.5 shrink-0" />
        <p>
          {t("note")} {t("noteMore")}
        </p>
      </div>
      <p className="text-xs text-fg-secondary">{t("verified")}</p>
      {invalid ? <InlineAlert tone="danger" title={t("invalid")} /> : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={send.isPending}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
