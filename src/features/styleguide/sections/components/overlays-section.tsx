"use client";

import { PanelRight, PanelBottom, SquarePen, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { quickCreateItems } from "@/components/shell/quick-create";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { SAMPLE_LATENCY_MS, wait } from "../../component-samples";
import { StyleguideSection } from "../../styleguide-section";

function Demo({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-3 rounded-tile bg-subtle p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-bold">{title}</h3>
        <p className="type-caption text-fg-muted">{description}</p>
      </div>
      {children}
    </div>
  );
}

/** Dialog, destructive confirm with an async action, end sheet and bottom sheet. */
export function OverlaysSection() {
  const t = useTranslations("Styleguide.components.overlays");
  const tCommon = useTranslations("Common");
  const tShell = useTranslations("Shell.quickCreate");

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

  return (
    <StyleguideSection tier="utility" id="overlays" span="twoThirds" title={t("title")} description={t("description")}>
      <div className="grid gap-3 sm:grid-cols-2">
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

        <Demo title={t("endSheet")} description={t("endSheetDescription")}>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="secondary">
                <Icon icon={PanelRight} mirror size={18} />
                {t("openEndSheet")}
              </Button>
            </SheetTrigger>
            <SheetContent
              title={t("endSheetTitle")}
              description={t("endSheetBody")}
              footer={
                <SheetClose asChild>
                  <Button>{tCommon("close")}</Button>
                </SheetClose>
              }
            >
              <ul className="flex flex-col gap-2">
                {(["one", "two", "three"] as const).map((key) => (
                  <li key={key} className="rounded-row bg-subtle px-4 py-3 text-sm">
                    {t(`endSheetRows.${key}`)}
                  </li>
                ))}
              </ul>
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
      </div>
    </StyleguideSection>
  );
}
