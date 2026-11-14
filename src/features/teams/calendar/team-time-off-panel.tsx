"use client";

import { Check, CircleSlash, Clock3, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { StatusChip } from "@/design-system/feedback/status-chip";
import type { StatusTone } from "@/design-system/tokens/colors";
import { RepositoryError } from "@/data/repositories";
import type { TeamTimeOffRequest, TeamTimeOffState } from "@/data/team-domain";
import { useTeamTimeOff, useTeamTimeOffActions, useTeamTimeOffHistory } from "@/data/team-queries";
import { useProjectFormat } from "@/features/projects/format";

/*
 * TM-03 time-off requests: a quiet Utility card under the event card. Rows
 * come from the server with its own decisions (`can.decide` for Lead+ on
 * someone else's pending request, `can.cancel` for the requester's pending /
 * not-yet-ended approved one) — no control is shown without them. Only
 * approved requests are absences on the calendar; the others stay here.
 * Reject takes an optional note; cancel asks for confirmation. Each row can
 * open its history (submitted → decided / canceled).
 */

const TONE: Record<TeamTimeOffState, StatusTone> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  canceled: "neutral",
};
const ICON = { pending: Clock3, approved: Check, rejected: X, canceled: CircleSlash } as const;

type Pending = { kind: "reject" | "cancel"; request: TeamTimeOffRequest } | null;

export function TeamTimeOffPanel({ teamId }: { teamId: string }) {
  const t = useTranslations("TeamCal.timeOffRequests");
  const requests = useTeamTimeOff(teamId);
  const { decide, cancel } = useTeamTimeOffActions(teamId);
  const [pending, setPending] = useState<Pending>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<string | null>(null);

  const failure = (cause: unknown) =>
    cause instanceof RepositoryError && cause.code === "conflict"
      ? t("conflict")
      : cause instanceof RepositoryError && cause.code === "forbidden"
        ? t("forbidden")
        : t("failed");

  const approve = (request: TeamTimeOffRequest) =>
    decide.mutate(
      { id: request.id, decision: "approve", note: null },
      {
        onSuccess: () => toast({ title: t("approved") }),
        onError: (cause) => toast({ tone: "danger", title: failure(cause) }),
      },
    );

  const close = () => {
    setPending(null);
    setNote("");
    setError(null);
  };

  const confirm = async () => {
    if (!pending) return;
    setError(null);
    try {
      if (pending.kind === "reject") {
        await decide.mutateAsync({ id: pending.request.id, decision: "reject", note: note.trim() || null });
        toast({ title: t("rejected") });
      } else {
        await cancel.mutateAsync(pending.request.id);
        toast({ title: t("canceled") });
      }
      close();
    } catch (cause) {
      setError(failure(cause));
      throw cause;
    }
  };

  const items = [...(requests.data ?? [])].sort(
    (a, b) => Number(b.state === "pending") - Number(a.state === "pending") || b.createdAt.localeCompare(a.createdAt),
  );
  const waiting = items.filter((request) => request.can.decide).length;

  return (
    <section aria-labelledby="team-time-off-title" className="flex flex-col gap-3 rounded-[28px] bg-surface p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="team-time-off-title" className="text-sm font-bold text-fg">
          {t("title")}
        </h2>
        {waiting ? <span className="text-xs font-semibold text-fg-secondary">{t("waiting", { n: waiting })}</span> : null}
      </div>
      {requests.isError ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-fg-muted">{t("loadFailed")}</p>
          <Button variant="secondary" size="sm" onClick={() => void requests.refetch()}>
            {t("retry")}
          </Button>
        </div>
      ) : !requests.data ? (
        <p className="text-sm text-fg-muted">{t("loading")}</p>
      ) : !items.length ? (
        <p className="text-sm text-fg-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((request) => (
            <TimeOffRow
              key={request.id}
              teamId={teamId}
              request={request}
              busy={decide.isPending || cancel.isPending}
              historyOpen={history === request.id}
              onHistory={() => setHistory(history === request.id ? null : request.id)}
              onApprove={() => approve(request)}
              onReject={() => setPending({ kind: "reject", request })}
              onCancel={() => setPending({ kind: "cancel", request })}
            />
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={pending?.kind === "cancel"}
        onOpenChange={(open) => (open ? undefined : close())}
        tone="destructive"
        title={t("cancelTitle")}
        description={t("cancelBody")}
        confirmLabel={t("cancelConfirm")}
        cancelLabel={t("keep")}
        onConfirm={confirm}
        error={error}
      />
      <Dialog open={pending?.kind === "reject"} onOpenChange={(open) => (open || decide.isPending ? undefined : close())}>
        <DialogContent title={t("rejectTitle", { name: pending?.request.person.name ?? "" })}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void confirm().catch(() => undefined);
            }}
          >
            <Field>
              <FieldLabel>{t("note")}</FieldLabel>
              <Textarea dir="auto" maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />
            </Field>
            {error ? <InlineAlert tone="danger" title={error} /> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" disabled={decide.isPending} onClick={close}>
                {t("keep")}
              </Button>
              <Button type="submit" loading={decide.isPending}>
                {t("reject")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function TimeOffRow({
  teamId,
  request,
  busy,
  historyOpen,
  onHistory,
  onApprove,
  onReject,
  onCancel,
}: {
  teamId: string;
  request: TeamTimeOffRequest;
  busy: boolean;
  historyOpen: boolean;
  onHistory: () => void;
  onApprove: () => void;
  onReject: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("TeamCal.timeOffRequests");
  const format = useProjectFormat();
  const when =
    request.startDate === request.endDate
      ? format.day(request.startDate, "dayMonth")
      : format.range(request.startDate, request.endDate);
  const name = request.mine ? t("you") : request.person.name;
  return (
    <li className="flex flex-col gap-2 rounded-2xl p-3 inset-ring inset-ring-outline">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-sm font-semibold text-fg">
          <bdi>{name}</bdi>
          <span className="text-fg-secondary"> · {when}</span>
        </p>
        <StatusChip tone={TONE[request.state]} icon={ICON[request.state]}>
          {t(`state.${request.state}`)}
        </StatusChip>
      </div>
      {request.reason ? (
        <p dir="auto" className="text-xs text-fg-secondary">
          {request.reason}
        </p>
      ) : null}
      {request.decisionNote ? (
        <p className="text-xs text-fg-secondary">
          {t("decisionNote")} <bdi dir="auto">{request.decisionNote}</bdi>
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {request.can.decide ? (
          <>
            <Button size="sm" disabled={busy} onClick={onApprove}>
              {t("approve")}
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={onReject}>
              {t("reject")}
            </Button>
          </>
        ) : null}
        {request.can.cancel ? (
          <Button size="sm" variant="secondary" disabled={busy} onClick={onCancel}>
            {t("cancelRequest")}
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" aria-expanded={historyOpen} onClick={onHistory}>
          {t("history")}
        </Button>
      </div>
      {historyOpen ? <TimeOffHistory teamId={teamId} requestId={request.id} /> : null}
    </li>
  );
}

function TimeOffHistory({ teamId, requestId }: { teamId: string; requestId: string }) {
  const t = useTranslations("TeamCal.timeOffRequests");
  const format = useProjectFormat();
  const steps = useTeamTimeOffHistory(teamId, requestId);
  if (steps.isError) return <p className="text-xs text-fg-muted">{t("loadFailed")}</p>;
  if (!steps.data) return <p className="text-xs text-fg-muted">{t("loading")}</p>;
  return (
    <ol aria-label={t("history")} className="flex flex-col gap-1 border-s-2 border-outline ps-3">
      {steps.data.map((step) => (
        <li key={step.id} className="text-xs text-fg-secondary">
          {step.by
            ? t("step", { action: t(`action.${step.action}`), name: step.by.name })
            : t(`action.${step.action}`)}
          {" · "}
          {format.relative(step.at)}
        </li>
      ))}
    </ol>
  );
}
