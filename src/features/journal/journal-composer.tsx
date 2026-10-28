"use client";

import { MessageSquarePlus, Plus, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useId, useState, type FormEvent } from "react";
import { IconButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { normalizeJournalTags, type JournalEntry } from "@/data/domain";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import { moodKey } from "@/features/overview/ui/mood";
import { useTasksFormat } from "@/features/tasks/ui/use-tasks-format";
import { instantToClockTime } from "@/lib/dates/clock-time";
import { cn } from "@/lib/cn";
import { isPromptId, JOURNAL_HREF, nextPrompt } from "./domain/journal";
import { EnergySwitch, MoodPicker } from "./ui/mood-picker";
import { useJournalDraft } from "./use-journal-draft";

/*
 * The composer (P14 · Writing first): a signature sheet whose notch holds its
 * one contextual action, "Prompt me". Mood (5) · Energy (3) · tags · What
 * went well · Reflection; the reflection has the cursor on arrival. Every
 * user line is dir="auto". Auto-saves (600ms pause; choices at once), the
 * Saved label fades in (150ms). Opening another day expands the card in
 * (260ms; reduced motion: swap).
 */

export const JOURNAL_TEXT_ID = "journal-text";

export function JournalComposer({ day, today, entry }: { day: string; today: string; entry: JournalEntry | null }) {
  const t = useTranslations("Journal.composer");
  const tj = useTranslations("Journal");
  const format = useTasksFormat();
  const reduce = useReducedMotion();
  const draft = useJournalDraft(day, entry);
  const { value, edit } = draft;
  const ids = useId();
  const [tagOpen, setTagOpen] = useState(false);
  const [tagText, setTagText] = useState("");
  const isToday = day === today;
  const prompt = nextPrompt(value.prompts);

  const addPrompt = () => {
    if (!prompt) return;
    edit({ prompts: [...value.prompts, { id: prompt, answer: "" }] }, true);
    requestAnimationFrame(() => document.getElementById(`${ids}-prompt-${prompt}`)?.focus());
  };

  const addTag = (event: FormEvent) => {
    event.preventDefault();
    const tags = normalizeJournalTags([...value.tags, tagText]);
    if (tags.length !== value.tags.length) edit({ tags }, true);
    setTagText("");
    setTagOpen(false);
  };

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: reduce ? 0 : 0.26, ease: "easeOut" }}
    >
      <SignatureCard
        as="section"
        aria-labelledby={`${ids}-title`}
        data-journal-composer={day}
        action={<SignatureCardAction icon={MessageSquarePlus} label={prompt ? t("promptMe") : t("noMorePrompts")} disabled={!prompt} onClick={addPrompt} />}
        contentClassName="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-1 pe-14">
          <h2 id={`${ids}-title`} className="text-xs font-bold tracking-wide text-fg uppercase">
            {isToday ? t("today", { date: `${format.weekday(day)} ${format.dayMonth(day)}` }) : `${format.weekday(day)} · ${format.dayMonth(day)}`}
          </h2>
          {isToday ? null : (
            <Link href={JOURNAL_HREF} className="self-start text-xs font-semibold text-scope-deep underline underline-offset-4">
              {t("backToToday")}
            </Link>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <p id={`${ids}-mood`} className="text-xs font-bold text-fg">
            {isToday ? t("question") : t("questionPast")}
          </p>
          <MoodPicker labelledBy={`${ids}-mood`} value={value.mood} onChange={(mood) => edit({ mood }, true)} levelLabel={(level) => tj(`moodLevel.${moodKey(level)}`)} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold text-fg">{t("energy")}</span>
          <EnergySwitch label={t("energy")} value={value.energy} onChange={(energy) => edit({ energy }, value.mood !== null)} levelLabel={(energy) => tj(`energyLevel.${energy}`)} />
          <ul aria-label={t("tags")} className="flex flex-wrap items-center gap-1.5 sm:ms-auto">
            {value.tags.map((tag) => (
              <li key={tag} className="inline-flex h-8 items-center gap-0.5 rounded-pill bg-scope-soft ps-3 pe-1 text-xs font-bold text-scope-deep">
                <bdi dir="auto">#{tag}</bdi>
                <IconButton size="sm" variant="ghost" icon={X} label={t("removeTag", { tag })} className="size-6" onClick={() => edit({ tags: value.tags.filter((item) => item !== tag) }, true)} />
              </li>
            ))}
            <li>
              {tagOpen ? (
                <form onSubmit={addTag} className="flex items-center">
                  <Input
                    dir="auto"
                    autoFocus
                    aria-label={t("addTag")}
                    placeholder={t("tagPlaceholder")}
                    value={tagText}
                    onChange={(event) => setTagText(event.target.value)}
                    onBlur={() => (tagText.trim() ? undefined : setTagOpen(false))}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.stopPropagation();
                        setTagOpen(false);
                      }
                    }}
                    className="h-8 w-28 text-xs"
                  />
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setTagOpen(true)}
                  className="inline-flex h-8 items-center gap-1 rounded-pill px-3 text-xs font-bold text-fg-secondary inset-ring inset-ring-outline hover:text-fg focus-visible:focus-ring"
                >
                  <Plus aria-hidden size={14} />
                  {t("addTag")}
                </button>
              )}
            </li>
          </ul>
        </div>

        <div className="flex flex-col gap-3 rounded-tile bg-subtle p-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[0.6875rem] font-bold tracking-wide text-fg-muted uppercase">{t("wentWell")}</span>
            <Input dir="auto" value={value.wentWell} placeholder={t("wentWellPlaceholder")} onChange={(event) => edit({ wentWell: event.target.value })} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[0.6875rem] font-bold tracking-wide text-fg-muted uppercase">{t("reflection")}</span>
            <Textarea
              id={JOURNAL_TEXT_ID}
              dir="auto"
              rows={7}
              autoFocus={isToday}
              value={value.text}
              placeholder={t("reflectionPlaceholder")}
              onChange={(event) => edit({ text: event.target.value })}
            />
          </label>
          {value.prompts.map((item) => (
            <div key={item.id} className="flex flex-col gap-1.5" data-journal-prompt={item.id}>
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={`${ids}-prompt-${item.id}`} className="text-[0.6875rem] font-bold tracking-wide text-fg-muted uppercase">
                  {isPromptId(item.id) ? tj(`prompts.${item.id}`) : item.id}
                </label>
                <IconButton
                  size="sm"
                  variant="ghost"
                  icon={X}
                  label={t("removePrompt")}
                  className="size-7"
                  onClick={() => edit({ prompts: value.prompts.filter((other) => other.id !== item.id) }, true)}
                />
              </div>
              <Textarea
                id={`${ids}-prompt-${item.id}`}
                dir="auto"
                rows={2}
                value={item.answer}
                onChange={(event) => edit({ prompts: value.prompts.map((other) => (other.id === item.id ? { ...other, answer: event.target.value } : other)) })}
              />
            </div>
          ))}
        </div>

        <p aria-live="polite" className="min-h-4 text-end text-xs font-semibold text-fg-muted" data-journal-status={draft.status}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={draft.status}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className={cn(draft.status === "error" && "text-danger")}
            >
              {draft.status === "saved" && draft.savedAt
                ? t("saved", { time: format.clock(instantToClockTime(draft.savedAt)) })
                : draft.status === "saving"
                  ? t("saving")
                  : draft.status === "error"
                    ? t("error")
                    : t("autoSave")}
            </motion.span>
          </AnimatePresence>
        </p>
      </SignatureCard>
    </motion.div>
  );
}
