"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PillGroup } from "@/components/ui/pills";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { clearAfterOptions, presenceStatuses, type ClearAfter, type PresenceStatus } from "@/data/team-domain";
import { useMyPresence, usePresenceActions } from "@/data/team-queries";
import { cn } from "@/lib/cn";
import { useTeamLabels } from "../labels";
import { PresenceDot } from "../presence";
import { useCurrentTeamAccess } from "../use-current-team";

/*
 * ?sheet=team-status (TS-01 · TM-90): manual status only (owner decision) —
 * Available / Busy / Away / Off today + optional note + clear after. Applies
 * to this team unless "Same status in all my teams" is on. "Share what I'm
 * working on" (owner update 10 Nov) opts in to the People & workload strip.
 * Nothing is inferred from calendars or activity.
 */

const NOTE_MAX = 80;

export function TeamStatusSheet({ onDone }: { onDone: () => void }) {
  const t = useTranslations("TeamStatus");
  const labels = useTeamLabels();
  const { team, capabilities } = useCurrentTeamAccess();
  const mine = useMyPresence(team?.id);
  if (!team || !capabilities) return null;
  if (!capabilities.setOwnStatus) return <InlineAlert tone="info" title={t("noRight")} />;
  if (!mine.data) return null;
  return <StatusForm key={team.id} teamId={team.id} initial={mine.data} onDone={onDone} labels={labels} />;
}

function StatusForm({
  teamId,
  initial,
  onDone,
  labels,
}: {
  teamId: string;
  initial: NonNullable<ReturnType<typeof useMyPresence>["data"]>;
  onDone: () => void;
  labels: ReturnType<typeof useTeamLabels>;
}) {
  const t = useTranslations("TeamStatus");
  const actions = usePresenceActions(teamId);
  const [status, setStatus] = useState<PresenceStatus>(initial.status ?? "available");
  const [note, setNote] = useState(initial.note);
  const [clearAfter, setClearAfter] = useState<ClearAfter>(initial.status ? initial.clearAfter : "today");
  const [allTeams, setAllTeams] = useState(initial.allTeams);
  const [shareWorkingOn, setShareWorkingOn] = useState(initial.shareWorkingOn);
  const [failed, setFailed] = useState(false);
  const statusLabelId = useId();
  const noteId = useId();
  const busy = actions.set.isPending || actions.clear.isPending;

  const save = () => {
    setFailed(false);
    actions.set.mutate(
      { status, note, clearAfter, allTeams, shareWorkingOn },
      {
        onSuccess: () => {
          toast({ title: t("saved") });
          onDone();
        },
        onError: () => setFailed(true),
      },
    );
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div role="radiogroup" aria-labelledby={statusLabelId} className="flex flex-col gap-1.5">
        <p id={statusLabelId} className="sr-only">
          {t("status")}
        </p>
        {presenceStatuses.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={status === value}
            onClick={() => setStatus(value)}
            className={cn(
              "flex min-h-12 items-center gap-2.5 rounded-row px-3.5 text-start text-sm font-bold text-fg transition-colors",
              status === value ? "bg-surface ring-[1.5px] ring-primary" : "bg-subtle hover:bg-raised",
            )}
          >
            <PresenceDot status={value} />
            {labels.status(value)}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={noteId} className="text-sm font-bold text-fg">
          {t("note")}
        </label>
        <Input
          id={noteId}
          dir="auto"
          value={note}
          maxLength={NOTE_MAX}
          placeholder={t("notePlaceholder")}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-bold text-fg">{t("clearAfter")}</p>
        <PillGroup
          label={t("clearAfter")}
          value={clearAfter}
          onValueChange={setClearAfter}
          options={clearAfterOptions.map((value) => ({ value, label: t(`options.${value}`) }))}
        />
      </div>

      {/* OPEN(DECISIONS): status storage scope — design default is per team with this toggle. */}
      <Switch label={t("allTeams")} checked={allTeams} onCheckedChange={setAllTeams} />
      <Switch label={t("shareWorkingOn")} checked={shareWorkingOn} onCheckedChange={setShareWorkingOn} />
      <p className="text-xs text-fg-secondary">{t("manualHint")}</p>

      {failed ? <InlineAlert tone="danger" title={t("failed")} /> : null}

      <div className="flex flex-wrap justify-end gap-2">
        {initial.status ? (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() =>
              actions.clear.mutate(undefined, {
                onSuccess: () => {
                  toast({ title: t("cleared") });
                  onDone();
                },
                onError: () => setFailed(true),
              })
            }
          >
            {t("clear")}
          </Button>
        ) : null}
        <Button type="submit" disabled={busy}>
          {t("set")}
        </Button>
      </div>
    </form>
  );
}
