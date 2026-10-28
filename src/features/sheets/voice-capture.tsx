"use client";

import { Mic, Pause, Play, RotateCcw } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { useCaptureInbox } from "@/data/queries";
import { usePreferences } from "@/features/preferences/use-preferences";
import { convertDigits } from "@/lib/locale/digits";
import { QUICK_ADD_TEXT_PARAM, sheetHref, type SheetId } from "./sheet-params";
import { useSpeechCapture } from "./use-speech-capture";

/*
 * Voice capture (P18 · G): recording · paused · transcribing · transcript
 * ready (editable) · couldn't transcribe. Recording starts on open; the volt
 * dot is the only live mark. The result becomes a task through Quick Add
 * (prefilled) or goes to Inbox as a "voice" capture. Unsupported browsers and
 * a blocked microphone land on the error state with "Type a note instead".
 */

function clock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function VoiceCapture({ onClose }: { onClose(): void }) {
  const t = useTranslations("Personal.sheets.voice");
  const { locale, digits } = usePreferences();
  const router = useRouter();
  const pathname = usePathname();
  const speech = useSpeechCapture(locale === "fa" ? "fa-IR" : "en-US");
  const capture = useCaptureInbox();
  // Null until edited: the editable text starts from the finished transcript.
  const [edited, setEdited] = useState<string | null>(null);
  const [sendError, setSendError] = useState(false);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  const { status, error, start } = speech;

  // Recording starts as soon as the panel opens (it was opened to record).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    start();
  }, [start]);

  const text = edited ?? speech.transcript;
  const retry = () => {
    setEdited(null);
    start();
  };

  const switchTo = (id: SheetId, extra?: Record<string, string>) => {
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(extra ?? {})) params.set(key, value);
    router.replace(sheetHref(pathname, `?${params.toString()}`, id), { scroll: false });
  };

  const sendToInbox = async (body: string) => {
    if (busy || !body.trim()) return;
    setBusy(true);
    setSendError(false);
    try {
      await capture.mutateAsync({ text: body.trim(), source: "voice" });
      toast({ tone: "success", title: t("sent") });
      onClose();
    } catch {
      setSendError(true);
      setBusy(false);
    }
  };

  const timer = (
    <bdi dir="ltr" className="tabular-nums" role="timer" aria-label={t("elapsed")}>
      {convertDigits(clock(speech.seconds), digits)}
    </bdi>
  );

  const heading =
    status === "recording" ? t("recording") : status === "paused" ? t("paused") : status === "processing" ? t("processing") : status === "done" ? t("done") : status === "error" ? t("errorTitle") : null;

  return (
    <div className="flex flex-col gap-3" data-voice-capture data-state={status}>
      {/* State changes are announced; the ticking timer is not. */}
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-fg-secondary">
        {status === "recording" ? (
          <span aria-hidden="true" className="size-2.5 rounded-full bg-volt motion-safe:animate-pulse" />
        ) : null}
        <span aria-live="polite">{heading}</span>
        {status === "recording" || status === "paused" ? <span aria-hidden="true">·</span> : null}
        {status === "recording" || status === "paused" ? timer : null}
      </div>

      {status === "recording" || status === "paused" ? (
        <p dir="auto" className="min-h-20 rounded-row bg-subtle px-3.5 py-3 text-sm leading-relaxed text-fg">
          {speech.transcript || speech.interim ? (
            <>
              {speech.transcript} <span className="text-fg-muted">{speech.interim}</span>
            </>
          ) : (
            <span className="text-fg-muted">{status === "paused" ? t("pausedHint") : t("live")}</span>
          )}
        </p>
      ) : null}

      {status === "recording" ? (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => { speech.cancel(); onClose(); }}>
            {t("cancel")}
          </Button>
          <Button variant="secondary" onClick={speech.pause}>
            <Icon icon={Pause} size={18} />
            {t("pause")}
          </Button>
          <Button onClick={speech.finish}>{t("finish")}</Button>
        </div>
      ) : null}

      {status === "paused" ? (
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={speech.resume}>
            <Icon icon={Play} size={18} />
            {t("resume")}
          </Button>
          <Button onClick={speech.finish}>{t("finish")}</Button>
        </div>
      ) : null}

      {status === "processing" || status === "idle" ? (
        <div role="status" className="flex items-center gap-3 text-sm text-fg-secondary">
          <Spinner />
          <span>{t("processingHint")}</span>
        </div>
      ) : null}

      {status === "done" ? (
        <>
          <Textarea
            aria-label={t("edit")}
            value={text}
            dir="auto"
            rows={4}
            autoFocus
            onChange={(event) => setEdited(event.target.value)}
          />
          <p className="text-xs text-fg-muted">{t("editHint")}</p>
          {sendError ? (
            <p role="alert" className="text-sm text-danger-text">
              {t("sendFailed")}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" disabled={!text.trim()} aria-busy={busy || undefined} onClick={() => void sendToInbox(text)}>
              {t("toInbox")}
            </Button>
            <Button disabled={!text.trim() || busy} onClick={() => switchTo("quick-add", { [QUICK_ADD_TEXT_PARAM]: text.trim() })}>
              {t("createTask")}
            </Button>
          </div>
        </>
      ) : null}

      {status === "error" && error ? (
        <>
          <p role="alert" className="text-sm text-fg-secondary">
            {t(`error.${error}`)}
          </p>
          {speech.transcript && error !== "unsupported" ? (
            <p dir="auto" className="rounded-row bg-subtle px-3.5 py-3 text-sm text-fg">
              {speech.transcript}
            </p>
          ) : null}
          <p className="text-xs text-fg-muted">{t("privacy")}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              {t("drop")}
            </Button>
            {error === "unsupported" || error === "denied" ? (
              <Button variant="secondary" onClick={() => switchTo("note")}>
                {t("typeInstead")}
              </Button>
            ) : null}
            {speech.transcript ? (
              <Button variant="secondary" aria-busy={busy || undefined} onClick={() => void sendToInbox(speech.transcript)}>
                {t("toInbox")}
              </Button>
            ) : null}
            {error !== "unsupported" ? (
              <Button onClick={retry}>
                <Icon icon={error === "denied" ? Mic : RotateCcw} size={18} />
                {t("retry")}
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
