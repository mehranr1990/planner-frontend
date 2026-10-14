"use client";

import { CircleHelp } from "lucide-react";
import { useTranslations } from "next-intl";
import { InlineAlert, InlineAlertAction } from "@/components/feedback/inline-alert";
import { Button, IconButton } from "@/components/ui/button";
import { toast, type ToastTone } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { DemoGroup } from "../../preview-frame";
import { StyleguideSection } from "../../styleguide-section";

const toastTones: readonly ToastTone[] = ["success", "info", "warning", "danger", "neutral"];

/** toast() triggers for every tone, inline alerts and a tooltip (Utility · Toasts & alerts). */
export function ToastsSection() {
  const t = useTranslations("Styleguide.components.toasts");

  const show = (tone: ToastTone) => {
    if (tone === "success") {
      toast({
        tone,
        title: t("samples.success.title"),
        action: {
          label: t("undo"),
          altText: t("undoAlt"),
          onClick: () => toast({ tone: "neutral", title: t("undone") }),
        },
      });
      return;
    }
    toast({ tone, title: t(`samples.${tone}.title`), description: t(`samples.${tone}.description`) });
  };

  return (
    <StyleguideSection tier="utility" id="toasts" span="third" title={t("title")} description={t("description")}>
      <DemoGroup title={t("toasts")}>
        <div className="flex flex-wrap gap-2">
          {toastTones.map((tone) => (
            <Button key={tone} variant="secondary" size="sm" onClick={() => show(tone)}>
              {t(`tones.${tone}`)}
            </Button>
          ))}
        </div>
      </DemoGroup>

      <DemoGroup title={t("alerts")}>
        <InlineAlert tone="warning" title={t("samples.warning.title")} description={t("samples.warning.description")} />
        <InlineAlert
          tone="danger"
          title={t("samples.danger.title")}
          description={t("samples.danger.description")}
          action={<InlineAlertAction onClick={() => toast({ tone: "info", title: t("retrying") })}>{t("retryNow")}</InlineAlertAction>}
        />
        <InlineAlert tone="info" title={t("samples.info.title")} />
        <InlineAlert tone="success" title={t("samples.success.title")} />
      </DemoGroup>

      <DemoGroup title={t("tooltip")}>
        <div className="flex items-center gap-3">
          <Tooltip content={t("tooltipText")}>
            <IconButton icon={CircleHelp} label={t("tooltipLabel")} size="sm" />
          </Tooltip>
          <span className="type-caption text-fg-muted">{t("tooltipHint")}</span>
        </div>
      </DemoGroup>
    </StyleguideSection>
  );
}
