import { getTranslations } from "next-intl/server";

/** Echoes a dynamic route segment (`id=g-launch`), or "none" for an optional one that is absent. */
export async function RouteParamProbe({ name, value }: { name: string; value: string | undefined }) {
  const t = await getTranslations("Personal.skeleton");
  return (
    <dl data-probe="route-param" className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <dt className="type-label text-fg-muted">{t("params")}</dt>
      <dd dir="ltr" className="font-mono text-xs text-fg">
        {name}={value ?? t("none")}
      </dd>
    </dl>
  );
}
