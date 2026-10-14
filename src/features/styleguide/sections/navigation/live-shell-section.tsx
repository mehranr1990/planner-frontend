import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { defaultContextId } from "@/features/navigation/contexts";
import { contextHref } from "@/features/navigation/paths";
import { cn } from "@/lib/cn";
import { StyleguideSection } from "../../styleguide-section";

/** Hands off to the real, composed application shell. */
export function LiveShellSection() {
  const t = useTranslations("Styleguide.navigationPage.liveShell");
  return (
    <StyleguideSection id="live-shell" title={t("title")} description={t("description")}>
      <Link href={contextHref(defaultContextId)} className={cn(buttonVariants({ variant: "primary" }), "self-start")}>
        {t("link")}
        <Icon icon={ArrowUpRight} mirror size={18} />
      </Link>
    </StyleguideSection>
  );
}
