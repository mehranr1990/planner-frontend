import { useTranslations } from "next-intl";
import { Breadcrumbs } from "@/components/navigation/breadcrumbs";
import { ComingSoonBadge } from "@/components/navigation/coming-soon-badge";
import { Button } from "@/components/ui/button";
import { getAppContext } from "@/features/navigation/contexts";
import type { ContextId } from "@/features/navigation/types";
import { ContextPlaceholder } from "./context-placeholder";
import { PageHeader } from "./page-header";

/*
 * A context overview page for Step 2: the page header (breadcrumb with the
 * scope dot, "<Context> overview", the context's description, and the board's
 * primary action shown disabled as "Coming soon") above the placeholder
 * zones. Server-compatible, so route pages stay Server Components.
 */
export function ContextOverview({ context }: { context: ContextId }) {
  const t = useTranslations("Shell.pages");
  const tNav = useTranslations("Navigation");
  const tCommon = useTranslations("Common");
  const meta = getAppContext(context);
  const hintId = `${context}-overview-cta-hint`;

  return (
    <>
      <PageHeader
        breadcrumb={
          <Breadcrumbs scope={context} items={[{ label: tNav(meta.labelKey) }, { label: tNav("items.overview") }]} />
        }
        title={t(`${context}.title`)}
        subtitle={tNav(meta.descriptionKey)}
        actions={
          <>
            <ComingSoonBadge id={hintId} aria-hidden="true">
              {tCommon("comingSoon")}
            </ComingSoonBadge>
            <Button size="lg" aria-disabled="true" aria-describedby={hintId}>
              {t(`${context}.cta`)}
            </Button>
          </>
        }
      />
      <ContextPlaceholder context={context} />
    </>
  );
}
