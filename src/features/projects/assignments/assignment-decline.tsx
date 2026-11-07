"use client";

import { useTranslations } from "next-intl";
import { useId, useState, type ReactElement } from "react";
import { Button } from "@/components/ui/button";
import { PillGroup } from "@/components/ui/pills";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { DeclineReason } from "@/data/project-domain";
import { DESKTOP_QUERY, useMediaQuery } from "../use-media";

/*
 * The assignment-decline popover (D10, PJ-90 / PJM01 "Decline assignment"):
 * a reason is required (No capacity · Not my area · Missing info · Other),
 * the note is optional; the assigner sees both to reassign. A popover from
 * lg, a bottom sheet on phones, same fields.
 */

const REASONS: readonly DeclineReason[] = ["no-capacity", "not-my-area", "missing-info", "other"];
const REASON_KEY: Record<DeclineReason, "noCapacity" | "notMyArea" | "missingInfo" | "other"> = {
  "no-capacity": "noCapacity",
  "not-my-area": "notMyArea",
  "missing-info": "missingInfo",
  other: "other",
};

export interface AssignmentDeclineProps {
  /** Who assigned the task ("Tell Sara why"). */
  assignerName: string;
  /** The Decline button that opens it. */
  trigger: ReactElement;
  busy?: boolean;
  onDecline: (reason: DeclineReason, note: string) => void;
}

export function AssignmentDecline({ assignerName, trigger, busy = false, onDecline }: AssignmentDeclineProps) {
  const t = useTranslations("Project.decline");
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [open, setOpen] = useState(false);

  const form = (
    <DeclineForm
      assignerName={assignerName}
      busy={busy}
      onSubmit={(reason, note) => {
        setOpen(false);
        onDecline(reason, note);
      }}
    />
  );

  if (desktop) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent align="start" aria-label={t("title")} className="w-88" data-scope="project">
          <p className="pb-1 type-title text-fg">{t("title")}</p>
          {form}
        </PopoverContent>
      </Popover>
    );
  }
  return (
    <>
      <span className="contents" onClickCapture={() => setOpen(true)}>
        {trigger}
      </span>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" title={t("title")} data-scope="project">
          {form}
        </SheetContent>
      </Sheet>
    </>
  );
}

function DeclineForm({
  assignerName,
  busy,
  onSubmit,
}: {
  assignerName: string;
  busy: boolean;
  onSubmit: (reason: DeclineReason, note: string) => void;
}) {
  const t = useTranslations("Project.decline");
  const [reason, setReason] = useState<DeclineReason>("no-capacity");
  const [note, setNote] = useState("");
  const noteId = useId();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(reason, note.trim());
      }}
    >
      <p className="text-sm text-fg-secondary">{t("why", { name: assignerName })}</p>
      <PillGroup
        label={t("reason")}
        value={reason}
        onValueChange={setReason}
        options={REASONS.map((value) => ({ value, label: t(REASON_KEY[value]) }))}
      />
      <label htmlFor={noteId} className="sr-only">
        {t("note")}
      </label>
      <Textarea
        id={noteId}
        value={note}
        maxLength={280}
        onChange={(event) => setNote(event.target.value)}
        placeholder={t("notePlaceholder")}
      />
      <Button type="submit" disabled={busy} className="w-full">
        {t("submit")}
      </Button>
    </form>
  );
}
