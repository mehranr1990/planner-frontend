"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Breadcrumbs } from "@/components/navigation/breadcrumbs";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { toast } from "@/components/ui/toast";
import { getAppContext } from "@/features/navigation/contexts";
import type { ContextId } from "@/features/navigation/types";
import { usePreferences } from "@/features/preferences/use-preferences";
import { formatDate } from "@/lib/dates/format";
import { SAMPLE_DATE } from "../../samples";
import { PreviewFrame } from "../../preview-frame";
import { StyleguideSection } from "../../styleguide-section";

interface PageHeaderSectionProps {
  context: ContextId;
  workspaceName: string;
}

/** Breadcrumbs and the page header for the preview context. */
export function PageHeaderSection({ context, workspaceName }: PageHeaderSectionProps) {
  const t = useTranslations("Styleguide.navigationPage.pageHeader");
  const tContext = useTranslations("Styleguide.context");
  const preferences = usePreferences();
  const meta = getAppContext(context);

  const items = [
    { label: tContext(context), href: meta.basePath },
    { label: workspaceName },
    { label: t("current") },
  ];

  return (
    <StyleguideSection tier="utility" id="page-header" span="wide" title={t("title")} description={t("description")}>
      <PreviewFrame label={t("breadcrumbsCaption")}>
        <Breadcrumbs items={items} scope={context} aria-label={t("breadcrumbsLabel")} />
      </PreviewFrame>
      <PreviewFrame label={t("headerCaption")}>
        <div>
          <PageHeader
            titleAs="h3"
            breadcrumb={<Breadcrumbs items={items} scope={context} aria-label={t("headerBreadcrumbsLabel")} />}
            title={t("current")}
            subtitle={formatDate(SAMPLE_DATE, "full", preferences)}
            actions={
              <Button onClick={() => toast({ tone: "neutral", title: t("action") })}>
                <Icon icon={Plus} size={18} />
                {t("action")}
              </Button>
            }
          />
        </div>
      </PreviewFrame>
    </StyleguideSection>
  );
}
