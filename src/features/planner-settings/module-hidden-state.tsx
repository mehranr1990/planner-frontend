"use client";

import { EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/feedback/state-views";
import { Button } from "@/components/ui/button";
import { UtilityCard } from "@/design-system/surfaces/utility-card";
import { cn } from "@/lib/cn";
import { isOptionalModule, type OptionalModuleId, type PersonalModuleId } from "./modules";
import { isModuleVisible } from "./planner-settings";
import { usePlannerSettings, usePlannerSettingsActions } from "./use-planner-settings";

export interface ModuleHiddenStateProps {
  module: OptionalModuleId;
  /** Heading level for the title: h2 under a page header (the default), h1 when the state is the whole page, h3 in a sheet. */
  titleAs?: "h1" | "h2" | "h3";
  className?: string;
}

/**
 * P17 · States "Hidden module deep link": what a hidden module's route shows
 * instead of a 404 ("Finance is hidden · Turn Finance on"). Utility surface,
 * never a notch. Turning the module on refreshes the server render, so the
 * real page replaces this in place.
 */
export function ModuleHiddenState({ module, titleAs = "h2", className }: ModuleHiddenStateProps) {
  const t = useTranslations("Settings");
  const { setModuleVisible } = usePlannerSettingsActions();
  const name = t(`modules.${module}`);

  return (
    <UtilityCard as="section" tone="surface" padding="none" data-module-hidden={module} className={className}>
      <EmptyState
        variant="bare"
        icon={EyeOff}
        titleAs={titleAs}
        title={t("hiddenModule.title", { module: name })}
        description={t("hiddenModule.description", { module: name })}
        primaryAction={
          <Button type="button" onClick={() => setModuleVisible(module, true)}>
            {t("hiddenModule.turnOn", { module: name })}
          </Button>
        }
      />
    </UtilityCard>
  );
}

export interface ModuleGateProps extends Omit<ModuleHiddenStateProps, "module"> {
  module: PersonalModuleId;
  children: ReactNode;
}

/**
 * Renders the module's page, or its hidden state when the user hid it. Reads
 * the client store (seeded by the server), so a route needs no request data
 * of its own and the toggle takes effect at once. Core modules always pass.
 * A gate wraps a whole page, so the hidden state carries the page h1.
 */
export function ModuleGate({ module, children, className, titleAs = "h1" }: ModuleGateProps) {
  const settings = usePlannerSettings();
  if (!isOptionalModule(module) || isModuleVisible(settings, module)) return <>{children}</>;
  return (
    <ModuleHiddenState
      module={module}
      titleAs={titleAs}
      className={cn("mx-auto w-full max-w-xl", className)}
    />
  );
}
