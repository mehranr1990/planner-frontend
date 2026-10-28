"use client";

import { useTranslations } from "next-intl";
import { useId, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { PillGroup, type PillOption } from "@/components/ui/pills";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { getPlannerToday } from "@/data/clock";
import { useAddBrainDumpLine, useCaptureInbox, useProcessInbox } from "@/data/queries";
import { isModuleVisible } from "@/features/planner-settings/planner-settings";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";

/*
 * Quick note (P18 · F, ⌘⇧N): one text area and where it goes.
 * "Save as note" files it straight as a note (an Inbox capture already
 * processed to "note"), "→ Inbox" leaves it to triage, "→ Brain Dump" appends
 * it to today's page. ⌘/Ctrl+Enter saves. A failed save keeps the text.
 */

type Destination = "note" | "inbox" | "brain-dump";

export function QuickNote({ onClose }: { onClose(): void }) {
  const t = useTranslations("Personal.sheets.note");
  const settings = usePlannerSettings();
  const capture = useCaptureInbox();
  const processItem = useProcessInbox();
  const addLine = useAddBrainDumpLine();
  const [text, setText] = useState("");
  const [to, setTo] = useState<Destination>("note");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const errorId = useId();

  const options: PillOption<Destination>[] = [
    { value: "note", label: t("to.note") },
    { value: "inbox", label: t("to.inbox") },
    ...(isModuleVisible(settings, "braindump") ? [{ value: "brain-dump" as const, label: t("to.brain-dump") }] : []),
  ];

  const save = async () => {
    if (busy) return;
    const body = text.trim();
    if (!body) {
      setError(t("empty"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (to === "brain-dump") {
        await addLine.mutateAsync({ day: getPlannerToday(), text: body });
      } else {
        const item = await capture.mutateAsync({ text: body, source: "note" });
        if (to === "note") await processItem.mutateAsync({ id: item.id, to: "note" });
      }
      toast({ tone: "success", title: t(`saved.${to}`) });
      onClose();
    } catch {
      setError(t("failed"));
      setBusy(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void save();
    }
  };

  return (
    <div className="flex flex-col gap-3" data-quick-note>
      <Textarea
        aria-label={t("label")}
        placeholder={t("placeholder")}
        value={text}
        dir="auto"
        rows={4}
        autoFocus
        invalid={error !== null}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => {
          setText(event.target.value);
          if (error) setError(null);
        }}
        onKeyDown={onKeyDown}
      />
      <p id={errorId} role="alert" className="min-h-0 text-sm text-danger-text empty:hidden">
        {error}
      </p>
      <PillGroup label={t("destination")} value={to} onValueChange={setTo} options={options} />
      <div className="flex items-center justify-between gap-3">
        <span aria-hidden="true" className="text-xs text-fg-muted">
          {t("hint")}
        </span>
        <Button onClick={() => void save()} aria-busy={busy || undefined} aria-disabled={busy || undefined}>
          {busy ? t("saving") : t("save")}
        </Button>
      </div>
    </div>
  );
}
