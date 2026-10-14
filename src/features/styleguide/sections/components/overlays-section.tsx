"use client";

import {
  CircleHelp,
  NotebookPen,
  PanelBottom,
  PanelRight,
  ReceiptText,
  Repeat,
  SquareCheck,
  SquarePen,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { quickCreateItems } from "@/components/shell/quick-create";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Button, IconButton } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  FloatingPanel,
  FloatingPanelClose,
  FloatingPanelContent,
  FloatingPanelTrigger,
} from "@/components/ui/floating-panel";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { usePreferences } from "@/features/preferences/use-preferences";
import { formatTime } from "@/lib/dates/format";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/locale/digits";
import { SAMPLE_LATENCY_MS, wait } from "../../component-samples";
import { StyleguideSection } from "../../styleguide-section";

const frequencyIds = ["daily", "weekdays", "custom"] as const;
const detailRows = ["context", "status", "reminder"] as const;
const RULES = ["popoverRule", "geometryRule", "mobileRule"] as const;
/** Task detail sample reminder (P06). */
const DETAIL_REMINDER = new Date(2026, 9, 15, 10, 0);

function Demo({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-3 rounded-tile bg-subtle p-4">
      <div className="flex flex-col gap-1">
        <h4 className="text-sm font-bold">{title}</h4>
        <p className="type-caption text-fg-muted">{description}</p>
      </div>
      {children}
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="type-label text-fg-secondary">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  );
}

/**
 * Dialogs, the tooltip island and the P18 containers: drawer (420), detail
 * drawer (520), centred sheet, bottom sheet and floating panel. Panel
 * content is illustrative only; the real flows are built with their screens.
 */
export function OverlaysSection() {
  const t = useTranslations("Styleguide.components.overlays");
  const tCommon = useTranslations("Common");
  const tShell = useTranslations("Shell.quickCreate");
  const preferences = usePreferences();
  const { digits } = preferences;
  const [frequency, setFrequency] = useState<(typeof frequencyIds)[number]>("daily");

  const confirmDelete = async () => {
    await wait(SAMPLE_LATENCY_MS);
    toast({
      tone: "success",
      title: t("deleted"),
      action: {
        label: t("undo"),
        altText: t("undoAlt"),
        onClick: () => toast({ tone: "neutral", title: t("restored") }),
      },
    });
  };

  const cancel = (
    <SheetClose asChild>
      <Button variant="secondary">{tCommon("cancel")}</Button>
    </SheetClose>
  );

  return (
    <StyleguideSection tier="utility" id="overlays" title={t("title")} description={t("description")}>
      <Group title={t("dialogsTitle")}>
        <Demo title={t("dialog")} description={t("dialogDescription")}>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">
                <Icon icon={SquarePen} size={18} />
                {t("openDialog")}
              </Button>
            </DialogTrigger>
            <DialogContent title={t("dialogTitle")} description={t("dialogBody")} size="sm">
              <Field>
                <FieldLabel>{t("blockName")}</FieldLabel>
                <Input defaultValue={t("blockValue")} />
              </Field>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="secondary">{tCommon("cancel")}</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button onClick={() => toast({ tone: "success", title: t("saved") })}>{tCommon("save")}</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Demo>

        <Demo title={t("confirm")} description={t("confirmDescription")}>
          <ConfirmDialog
            tone="destructive"
            title={t("confirmTitle")}
            description={t("confirmBody")}
            onConfirm={confirmDelete}
            trigger={
              <Button variant="destructive">
                <Icon icon={Trash2} size={18} />
                {t("openConfirm")}
              </Button>
            }
          />
        </Demo>

        <Demo title={t("tooltip")} description={t("tooltipDescription")}>
          <div className="flex flex-wrap items-center gap-3">
            <Tooltip content={t("tooltipText")}>
              <IconButton icon={CircleHelp} label={t("tooltipLabel")} size="sm" />
            </Tooltip>
            {/*
              Static specimen so the island reads in screenshots: the same
              tokens as Tooltip (surface, shadow-tooltip, 16px radius, 10/12
              padding). Hidden from assistive tech: the live one is above.
            */}
            <span
              aria-hidden="true"
              className="max-w-64 rounded-field bg-surface px-3 py-2.5 text-xs font-semibold text-fg shadow-tooltip"
            >
              {t("tooltipText")}
            </span>
          </div>
        </Demo>
      </Group>

      <Group title={t("containersTitle")}>
        <Demo title={t("drawer")} description={t("drawerRule")}>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="secondary">
                <Icon icon={Repeat} size={18} />
                {t("openDrawer")}
              </Button>
            </SheetTrigger>
            <SheetContent
              side="end"
              size="drawer"
              title={t("drawerTitle")}
              description={t("drawerBody")}
              footer={
                <>
                  {cancel}
                  <SheetClose asChild>
                    <Button onClick={() => toast({ tone: "success", title: t("habitCreated") })}>
                      {t("createHabit")}
                    </Button>
                  </SheetClose>
                </>
              }
            >
              <div className="flex flex-col gap-5">
                <Field>
                  <FieldLabel>{t("habitName")}</FieldLabel>
                  <Input defaultValue={t("habitValue", { count: formatNumber(20, digits) })} />
                </Field>
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-semibold">{t("frequency")}</span>
                  <Segmented
                    label={t("frequency")}
                    variant="neutral"
                    className="self-start"
                    value={frequency}
                    onValueChange={setFrequency}
                    options={frequencyIds.map((id) => ({ value: id, label: t(`frequencies.${id}`) }))}
                  />
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </Demo>

        <Demo title={t("detail")} description={t("detailRule")}>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="secondary">
                <Icon icon={PanelRight} mirror size={18} />
                {t("openDetail")}
              </Button>
            </SheetTrigger>
            <SheetContent
              side="end"
              size="detail"
              title={t("detailTitle")}
              description={t("detailBody")}
              footer={
                <>
                  <SheetClose asChild>
                    <Button variant="secondary">{tCommon("close")}</Button>
                  </SheetClose>
                  <SheetClose asChild>
                    <Button onClick={() => toast({ tone: "neutral", title: tCommon("comingSoon") })}>
                      <Icon icon={SquareCheck} size={18} />
                      {t("complete")}
                    </Button>
                  </SheetClose>
                </>
              }
            >
              <ul className="flex flex-col gap-2">
                {detailRows.map((row) => (
                  <li key={row} className="rounded-field bg-subtle px-4 py-3 text-sm">
                    {t(`detailRows.${row}`, { time: formatTime(DETAIL_REMINDER, preferences) })}
                  </li>
                ))}
              </ul>
            </SheetContent>
          </Sheet>
        </Demo>

        <Demo title={t("center")} description={t("centerRule")}>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="secondary">
                <Icon icon={ReceiptText} size={18} />
                {t("openCenter")}
              </Button>
            </SheetTrigger>
            <SheetContent
              side="center"
              title={t("centerTitle")}
              description={t("centerBody")}
              footer={
                <>
                  {cancel}
                  <SheetClose asChild>
                    <Button onClick={() => toast({ tone: "success", title: t("expenseSaved") })}>
                      {tCommon("save")}
                    </Button>
                  </SheetClose>
                </>
              }
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel>{t("amount")}</FieldLabel>
                  <Input inputMode="decimal" defaultValue={formatNumber(185_000, digits)} />
                </Field>
                <Field>
                  <FieldLabel>{t("expenseTitle")}</FieldLabel>
                  <Input defaultValue={t("expenseValue")} />
                </Field>
              </div>
            </SheetContent>
          </Sheet>
        </Demo>

        <Demo title={t("bottomSheet")} description={t("bottomSheetDescription")}>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="secondary">
                <Icon icon={PanelBottom} size={18} />
                {t("quickAdd")}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" title={t("quickAdd")} description={t("quickAddBody")}>
              {/* The shell's quick create entries (same ids, icons and tile colours). */}
              <ul className="grid grid-cols-3 gap-2">
                {quickCreateItems.map((item) => (
                  <li key={item.id}>
                    <SheetClose asChild>
                      <button
                        type="button"
                        onClick={() => toast({ tone: "neutral", title: tShell(`items.${item.id}`), description: tCommon("comingSoon") })}
                        className={cn(
                          "flex min-h-18 w-full flex-col items-center justify-center gap-1.5 rounded-tile text-sm font-semibold transition-[scale] active:scale-[0.97]",
                          item.tile,
                        )}
                      >
                        <span aria-hidden className={cn("size-2 rounded-full", item.dot)} />
                        <span className="flex items-center gap-1.5">
                          <Icon icon={item.icon} size={16} className="text-fg-secondary" />
                          {tShell(`items.${item.id}`)}
                        </span>
                      </button>
                    </SheetClose>
                  </li>
                ))}
              </ul>
            </SheetContent>
          </Sheet>
        </Demo>

        <Demo title={t("floating")} description={t("floatingRule")}>
          <FloatingPanel>
            <FloatingPanelTrigger asChild>
              <Button variant="secondary">
                <Icon icon={NotebookPen} size={18} />
                {t("openFloating")}
              </Button>
            </FloatingPanelTrigger>
            <FloatingPanelContent
              title={t("floatingTitle")}
              footer={
                <FloatingPanelClose asChild>
                  <Button onClick={() => toast({ tone: "success", title: t("noteSaved") })}>{t("saveNote")}</Button>
                </FloatingPanelClose>
              }
            >
              <Field>
                <FieldLabel>{t("noteLabel")}</FieldLabel>
                <Textarea rows={4} placeholder={t("notePlaceholder")} />
              </Field>
            </FloatingPanelContent>
          </FloatingPanel>
        </Demo>

        <div className="flex min-w-0 flex-col gap-2 rounded-tile border border-dashed border-outline p-4">
          <h4 className="text-sm font-bold">{t("rulesTitle")}</h4>
          <ul className="flex flex-col gap-1.5 type-caption text-fg-secondary">
            {RULES.map((rule) => (
              <li key={rule}>{t(rule)}</li>
            ))}
          </ul>
        </div>
      </Group>
    </StyleguideSection>
  );
}
