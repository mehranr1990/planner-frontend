"use client";

import { ArrowRight, Bell, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, buttonVariants, IconButton, type ButtonVariant } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { DemoGroup } from "../../preview-frame";
import { StyleguideSection } from "../../styleguide-section";

const variants = ["primary", "secondary", "outline", "destructive", "ghost"] as const satisfies readonly ButtonVariant[];
const states = ["default", "hover", "pressed", "focus", "disabled", "loading"] as const;
type PreviewState = (typeof states)[number];

/*
 * Hover, pressed and focus cannot be forced on a real button, so those columns
 * are static, non-interactive replicas built from the same classes plus the
 * state's token (hidden from assistive tech, like the Foundations focus preview).
 */
const stateClasses: Record<ButtonVariant, Record<"hover" | "pressed", string>> = {
  primary: { hover: "bg-primary-hover", pressed: "bg-primary-pressed scale-[0.97]" },
  secondary: { hover: "bg-secondary-hover", pressed: "bg-secondary-pressed scale-[0.97]" },
  outline: { hover: "bg-subtle", pressed: "bg-raised scale-[0.97]" },
  destructive: { hover: "bg-destructive-hover", pressed: "bg-destructive-hover scale-[0.97]" },
  ghost: { hover: "bg-raised text-fg", pressed: "bg-raised text-fg scale-[0.97]" },
};

function StateCell({ variant, state, label, loadingLabel }: { variant: ButtonVariant; state: PreviewState; label: string; loadingLabel: string }) {
  if (state === "default") return <Button variant={variant}>{label}</Button>;
  if (state === "disabled")
    return (
      <Button variant={variant} disabled>
        {label}
      </Button>
    );
  if (state === "loading")
    return (
      <Button variant={variant} loading loadingText={loadingLabel}>
        {label}
      </Button>
    );
  const extra = state === "focus" ? "focus-ring" : stateClasses[variant][state];
  return (
    <span aria-hidden className={cn(buttonVariants({ variant }), "pointer-events-none", extra)}>
      {label}
    </span>
  );
}

/** The full button state matrix (Utility · Button states) plus icon buttons. */
export function ButtonsSection() {
  const t = useTranslations("Styleguide.components.buttons");
  const tCommon = useTranslations("Common");

  return (
    <StyleguideSection tier="utility" id="buttons" title={t("title")} description={t("description")}>
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <table className="w-full min-w-[52rem] border-separate border-spacing-y-2 text-start">
          <caption className="sr-only">{t("matrix")}</caption>
          <thead>
            <tr>
              <td />
              {states.map((state) => (
                <th key={state} scope="col" className="type-caption pb-1 text-center font-semibold text-fg-secondary">
                  {t(`states.${state}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {variants.map((variant) => (
              <tr key={variant}>
                <th scope="row" className="pe-4 text-start text-sm font-bold">
                  {t(`variants.${variant}`)}
                </th>
                {states.map((state) => (
                  <td key={state} className="px-1.5 text-center">
                    <StateCell variant={variant} state={state} label={tCommon("save")} loadingLabel={t("saving")} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <DemoGroup title={t("sizes")}>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">{t("small")}</Button>
            <Button>{t("medium")}</Button>
            <Button size="lg">{t("large")}</Button>
          </div>
        </DemoGroup>
        <DemoGroup title={t("withIcons")}>
          <div className="flex flex-wrap items-center gap-2">
            <Button>
              <Icon icon={Plus} size={18} />
              {t("create")}
            </Button>
            <Button variant="outline">
              {t("continue")}
              <Icon icon={ArrowRight} mirror size={18} />
            </Button>
            <Button variant="destructive">
              <Icon icon={Trash2} size={18} />
              {tCommon("delete")}
            </Button>
          </div>
        </DemoGroup>
        <DemoGroup title={t("iconButtons")}>
          <div className="flex flex-wrap items-center gap-2">
            <IconButton icon={Bell} label={t("iconSmall")} size="sm" />
            <IconButton icon={Bell} label={t("iconMedium")} />
            <IconButton icon={Bell} label={t("iconLarge")} size="lg" />
            <IconButton icon={Plus} label={t("create")} variant="primary" />
            <IconButton icon={ArrowRight} mirror label={tCommon("next")} variant="outline" />
            <IconButton icon={Bell} label={t("iconLoading")} loading />
          </div>
        </DemoGroup>
      </div>
    </StyleguideSection>
  );
}
