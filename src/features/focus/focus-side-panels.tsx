"use client";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAddTaskNote } from "@/data/queries";
import { UtilityCard } from "@/design-system/surfaces/utility-card";

/*
 * Focus side panels (P09): Quick note (to the task's Notes) and Park a
 * distraction (held in the session, sent to Inbox when it ends). Quiet
 * utility cards; below lg they stack under the timer.
 */

export function FocusQuickNote({ taskId }: { taskId: string | null }) {
  const t = useTranslations("Focus.note");
  const id = useId();
  const [body, setBody] = useState("");
  const [saved, setSaved] = useState(false);
  const addNote = useAddTaskNote();

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!taskId || !body.trim()) return;
    addNote.mutate(
      { id: taskId, body: body.trim() },
      {
        onSuccess: () => {
          setBody("");
          setSaved(true);
        },
      },
    );
  };

  return (
    <UtilityCard as="section" aria-labelledby={`${id}-title`} className="flex flex-col gap-3">
      <h2 id={`${id}-title`} className="text-[0.9375rem] font-bold">
        {t("title")}
      </h2>
      <form onSubmit={save} className="flex flex-col gap-2">
        <label htmlFor={`${id}-body`} className="sr-only">
          {t("label")}
        </label>
        <Textarea
          id={`${id}-body`}
          dir="auto"
          rows={4}
          value={body}
          disabled={!taskId}
          placeholder={taskId ? t("placeholder") : t("noTask")}
          onChange={(event) => {
            setBody(event.target.value);
            setSaved(false);
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <p role="status" className="text-xs text-fg-muted">
            {saved ? t("saved") : t("hint")}
          </p>
          <Button type="submit" size="sm" variant="secondary" disabled={!taskId || !body.trim()} aria-busy={addNote.isPending}>
            {t("save")}
          </Button>
        </div>
      </form>
    </UtilityCard>
  );
}

export function FocusParkPanel({ parked, onPark }: { parked: readonly string[]; onPark: (text: string) => void }) {
  const t = useTranslations("Focus.park");
  const id = useId();
  const [text, setText] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    onPark(text);
    setText("");
  };

  return (
    <UtilityCard as="section" aria-labelledby={`${id}-title`} className="flex flex-col gap-3">
      <h2 id={`${id}-title`} className="text-[0.9375rem] font-bold">
        {t("title")}
      </h2>
      <form onSubmit={submit}>
        <label htmlFor={`${id}-input`} className="sr-only">
          {t("label")}
        </label>
        <Input
          id={`${id}-input`}
          dir="auto"
          value={text}
          placeholder={t("placeholder")}
          enterKeyHint="done"
          onChange={(event) => setText(event.target.value)}
        />
      </form>
      {parked.length > 0 ? (
        <ul aria-label={t("list")} className="flex flex-col gap-1.5">
          {parked.map((item, index) => (
            <li key={`${index}-${item}`} className="flex items-center gap-2 text-[0.8125rem] font-semibold">
              <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-icon-muted" />
              <bdi dir="auto" className="min-w-0 flex-1 truncate">
                {item}
              </bdi>
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-normal text-fg-muted">
                <Icon icon={ArrowRight} size={12} mirror />
                {t("toInbox")}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-fg-muted">{t("hint")}</p>
    </UtilityCard>
  );
}
