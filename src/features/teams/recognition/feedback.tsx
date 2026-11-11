"use client";

import { useTranslations } from "next-intl";
import { useId, useState, type ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectItem } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { UtilityCard } from "@/design-system/surfaces/utility-card";
import type { FeedbackInbox, FeedbackNote, FeedbackRequest } from "@/data/team-domain";
import { useRecognitionActions, useTeamMembers } from "@/data/team-queries";
import { useProjectFormat } from "@/features/projects/format";
import { useTeam } from "../team-gate";

/*
 * TM-10 feedback: private 1:1 (T9). Request feedback from a teammate, or
 * write feedback (unrequested, or answering a request asked of me). Only the
 * writer and the recipient ever read it; Leads don't see it by default. The
 * Feedback view replaces the thanks feed with the forms and my lists.
 */

export type FeedbackDialog = { kind: "write"; request?: FeedbackRequest } | { kind: "read"; note: FeedbackNote } | null;

const bold = (chunks: ReactNode) => <strong className="font-bold text-fg">{chunks}</strong>;

function usePeople() {
  const { team } = useTeam();
  const members = useTeamMembers(team.id);
  return (members.data ?? []).map((member) => member.person).filter((person) => person.id !== "me");
}

/** Request or write form (Feedback view, and the Write dialog). */
function FeedbackForm({
  mode,
  request,
  onDone,
}: {
  mode: "request" | "write";
  request?: FeedbackRequest;
  onDone?: () => void;
}) {
  const t = useTranslations("TeamFeedback");
  const { team } = useTeam();
  const people = usePeople();
  const actions = useRecognitionActions(team.id);
  const [toId, setToId] = useState<string | undefined>(request?.from.id);
  const [about, setAbout] = useState(request?.about ?? "");
  const [text, setText] = useState("");
  const privacyId = useId();
  const pending = actions.request.isPending || actions.write.isPending;

  const submit = () => {
    if (!toId || !text.trim()) {
      toast({ title: t("toast.missing"), tone: "danger" });
      return;
    }
    const done = (title: string) => () => {
      toast({ title });
      setText("");
      setAbout("");
      if (!request) setToId(undefined);
      onDone?.();
    };
    const failed = () => toast({ title: t("toast.failed"), tone: "danger" });
    if (mode === "request") {
      actions.request.mutate({ toId, about, question: text }, { onSuccess: done(t("toast.requested")), onError: failed });
    } else {
      actions.write.mutate(
        { toId, about, body: text, requestId: request?.id },
        { onSuccess: done(t("toast.sent")), onError: failed },
      );
    }
  };

  return (
    <form
      className="flex flex-col gap-3"
      aria-describedby={privacyId}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Field>
        <FieldLabel>{mode === "request" ? t("from") : t("to")}</FieldLabel>
        <Select value={toId} onValueChange={setToId} placeholder={t("pickPerson")} disabled={request !== undefined}>
          {people.map((person) => (
            <SelectItem key={person.id} value={person.id}>
              {person.name}
            </SelectItem>
          ))}
        </Select>
      </Field>
      <Field>
        <FieldLabel>{t("about")}</FieldLabel>
        <Input dir="auto" value={about} placeholder={t("aboutPlaceholder")} onChange={(event) => setAbout(event.target.value)} />
      </Field>
      {request ? (
        <p dir="auto" className="rounded-row bg-canvas px-3 py-2 text-sm text-fg">
          {request.question}
        </p>
      ) : null}
      <Field>
        <FieldLabel>{mode === "request" ? t("question") : t("body")}</FieldLabel>
        <Textarea
          dir="auto"
          rows={mode === "request" ? 2 : 4}
          value={text}
          placeholder={mode === "request" ? t("questionPlaceholder") : t("bodyPlaceholder")}
          onChange={(event) => setText(event.target.value)}
        />
      </Field>
      <p id={privacyId} className="text-xs text-fg-secondary">
        {t("privacy")}
      </p>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending}>
          {mode === "request" ? t("sendRequest") : t("send")}
        </Button>
      </div>
    </form>
  );
}

export function FeedbackDialogs({ dialog, onClose }: { dialog: FeedbackDialog; onClose: () => void }) {
  const t = useTranslations("TeamFeedback");
  const format = useProjectFormat();
  return (
    <Dialog open={dialog !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      {dialog?.kind === "write" ? (
        <DialogContent title={t("writeFeedback")}>
          <FeedbackForm mode="write" request={dialog.request} onDone={onClose} />
        </DialogContent>
      ) : dialog?.kind === "read" ? (
        <DialogContent title={t("noteTitle", { name: dialog.note.author.name })} description={dialog.note.about || undefined}>
          <p dir="auto" className="text-sm whitespace-pre-line text-fg">
            {dialog.note.body}
          </p>
          <p className="text-xs text-fg-secondary">
            {format.relative(dialog.note.at)} · {t("private")}
          </p>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

export function FeedbackTab({ inbox, onOpen }: { inbox: FeedbackInbox | undefined; onOpen: (dialog: FeedbackDialog) => void }) {
  const t = useTranslations("TeamFeedback");
  const format = useProjectFormat();
  const [mode, setMode] = useState<"request" | "write">("request");
  const headingId = useId();

  const row = (key: string, avatar: { name: string; initials: string }, text: ReactNode, meta: string, action?: ReactNode) => (
    <li key={key} className="flex items-center gap-2.5 py-2.5">
      <Avatar name={avatar.name} initials={avatar.initials} size={32} tone="team" decorative />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-sm text-fg">{text}</p>
        {meta ? <span className="text-xs text-fg-secondary">{meta}</span> : null}
      </div>
      {action}
    </li>
  );
  const about = (value: string) => (value ? t("onAbout", { about: value }) : "");

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)] lg:items-start">
      <UtilityCard as="section" aria-labelledby={headingId} className="gap-3">
        <h2 id={headingId} className="type-title text-fg">
          {mode === "request" ? t("request") : t("writeFeedback")}
        </h2>
        <Segmented<"request" | "write">
          label={t("mode.label")}
          variant="neutral"
          size="sm"
          value={mode}
          onValueChange={setMode}
          options={[
            { value: "request", label: t("mode.request") },
            { value: "write", label: t("mode.write") },
          ]}
        />
        <FeedbackForm key={mode} mode={mode} />
      </UtilityCard>
      <ProductCard as="section" aria-label={t("title")} className="gap-4">
        {!inbox ? (
          <Skeleton className="h-40 rounded-row" />
        ) : (
          (["asked", "received", "requested", "sent"] as const).map((list) => (
            <div key={list} className="flex flex-col">
              <h3 className="text-xs font-bold tracking-wide text-fg-secondary uppercase">{t(`lists.${list}`)}</h3>
              {inbox[list].length === 0 ? (
                <p className="py-2 text-sm text-fg-muted">{t("none")}</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {list === "asked"
                    ? inbox.asked.map((request) =>
                        row(
                          request.id,
                          request.from,
                          t.rich("askedYou", { name: request.from.name, b: bold }),
                          [about(request.about), request.due ? t("due", { day: format.day(request.due, "weekdayShort") }) : ""]
                            .filter(Boolean)
                            .join(" · "),
                          <Button size="sm" onClick={() => onOpen({ kind: "write", request })}>
                            {t("write")}
                          </Button>,
                        ),
                      )
                    : list === "requested"
                      ? inbox.requested.map((request) =>
                          row(
                            request.id,
                            request.to,
                            t.rich("requestedFrom", { name: request.to.name, b: bold }),
                            [about(request.about), request.status === "answered" ? t("answered") : t("waiting")].filter(Boolean).join(" · "),
                          ),
                        )
                      : inbox[list].map((note) =>
                          row(
                            note.id,
                            list === "received" ? note.author : note.recipient,
                            t.rich(list === "received" ? "receivedFrom" : "sentTo", {
                              name: (list === "received" ? note.author : note.recipient).name,
                              b: bold,
                            }),
                            [about(note.about), format.relative(note.at)].filter(Boolean).join(" · "),
                            <Button size="sm" variant="secondary" onClick={() => onOpen({ kind: "read", note })}>
                              {t("read")}
                            </Button>,
                          ),
                        )}
                </ul>
              )}
            </div>
          ))
        )}
      </ProductCard>
    </div>
  );
}
