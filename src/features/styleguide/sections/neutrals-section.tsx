"use client";

import { useTranslations } from "next-intl";
import { neutralTokens, type ColorToken } from "@/design-system/tokens/colors";
import { useCssVariable } from "@/hooks/use-css-variable";
import { cn } from "@/lib/cn";
import { StyleguideSection } from "../styleguide-section";

function NeutralRow({ token }: { token: ColorToken }) {
  const value = useCssVariable(token.cssVar);
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-row bg-subtle px-3 py-2">
      <span aria-hidden className={cn("size-9 rounded-row border border-hairline", token.swatch)} />
      <span className="min-w-0">
        <span lang="en" className="block text-sm font-semibold">
          {token.name}
        </span>
        <span lang="en" className="block truncate text-xs text-fg-muted">
          {token.role}
        </span>
      </span>
      <span dir="ltr" className="text-end text-xs">
        <code className="block font-semibold text-fg-secondary">{token.cssVar}</code>
        <code className="tabular block uppercase text-fg-muted">{value || "—"}</code>
      </span>
    </li>
  );
}

export function NeutralsSection() {
  const t = useTranslations("Styleguide.neutrals");
  return (
    <StyleguideSection id="neutrals" span="wide" title={t("title")} description={t("description")}>
      <ul className="grid gap-2 md:grid-cols-2">
        {neutralTokens.map((token) => (
          <NeutralRow key={token.cssVar} token={token} />
        ))}
      </ul>
    </StyleguideSection>
  );
}
