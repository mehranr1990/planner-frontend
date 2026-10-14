import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Surface } from "@/design-system/surfaces/surface";
import { defaultContextId } from "@/features/navigation/contexts";
import { contextHref } from "@/features/navigation/paths";

export default async function HomePage() {
  // Server-side translation: the locale comes from the preferences cookie.
  const t = await getTranslations("Home");

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-gutter py-16">
      <Surface elevation="island" padding="lg" className="flex flex-col items-start gap-4">
        <p className="type-label text-fg-muted">{t("overline")}</p>
        <h1 className="type-h1">{t("title")}</h1>
        <p className="type-body text-fg-secondary">{t("body")}</p>
        <div className="mt-2 flex flex-wrap gap-3">
          <Link href={contextHref(defaultContextId)} className={buttonVariants()}>
            {t("shell")}
          </Link>
          <Link href="/styleguide" className={buttonVariants({ variant: "secondary" })}>
            {t("styleguide")}
          </Link>
        </div>
      </Surface>
    </main>
  );
}
