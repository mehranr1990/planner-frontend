"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/state-views";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { usePreferences } from "@/features/preferences/use-preferences";
import { formatNumber } from "@/lib/locale/digits";
import { StateCaption } from "../../preview-frame";
import { StyleguideSection } from "../../styleguide-section";

/** Loading · empty · error, as on the Utility board. */
export function StatesSection() {
  const t = useTranslations("Styleguide.components.states");
  const { digits } = usePreferences();
  const [retries, setRetries] = useState(0);

  return (
    <StyleguideSection tier="utility" id="states" span="third" title={t("title")} description={t("description")}>
      <div className="flex flex-col gap-2">
        <LoadingState label={t("loadingLabel")} />
        <StateCaption>{t("loadingCaption")}</StateCaption>
      </div>
      <EmptyState
        variant="dashed"
        icon={Check}
        title={t("emptyTitle")}
        description={t("emptyDescription")}
        primaryAction={
          <Button variant="secondary" size="sm" onClick={() => toast({ tone: "neutral", title: t("comingSoon") })}>
            {t("emptyAction")}
          </Button>
        }
      />
      <ErrorState
        title={t("errorTitle")}
        description={retries > 0 ? t("errorRetried", { count: retries, formatted: formatNumber(retries, digits) }) : t("errorDescription")}
        onRetry={() => setRetries((count) => count + 1)}
      />
    </StyleguideSection>
  );
}
