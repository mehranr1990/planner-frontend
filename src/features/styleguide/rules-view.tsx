"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import type { Scope } from "@/design-system/tokens/colors";
import { componentRows, openQuestionIds, patternIds, patternMeta } from "./rules-data";
import { StyleguideMessages } from "./styleguide-messages";
import { StyleguideSection } from "./styleguide-section";
import { StyleguideShell } from "./styleguide-shell";
import { TierBadge, tiers } from "./tier-badge";

function TiersSection() {
  const t = useTranslations("Styleguide.tiers");
  const tr = useTranslations("Styleguide.rulesPage.tiers");
  return (
    <StyleguideSection id="tiers" title={tr("title")} description={tr("description")}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiers.map((tier) => (
          <div key={tier} className="flex flex-col gap-3 rounded-tile bg-subtle p-4">
            <TierBadge tier={tier} className="self-start" />
            <p className="type-body font-semibold">{t(`${tier}.description`)}</p>
            <p className="type-caption text-fg-secondary">{t(`${tier}.where`)}</p>
            <p className="type-caption text-fg-muted">{t(`${tier}.source`)}</p>
          </div>
        ))}
      </div>
    </StyleguideSection>
  );
}

function ClassificationSection() {
  const t = useTranslations("Styleguide.rulesPage.classification");
  const tn = useTranslations("Styleguide.rulesPage.componentNotes");
  return (
    <StyleguideSection id="classification" title={t("title")} description={t("description")}>
      <div className="overflow-x-auto rounded-tile border border-line">
        <table className="w-full min-w-xl border-collapse text-start text-sm">
          <thead className="bg-subtle">
            <tr>
              <th scope="col" className="px-4 py-3 text-start type-label text-fg-secondary">
                {t("component")}
              </th>
              <th scope="col" className="px-4 py-3 text-start type-label text-fg-secondary">
                {t("tier")}
              </th>
              <th scope="col" className="px-4 py-3 text-start type-label text-fg-secondary">
                {t("notes")}
              </th>
            </tr>
          </thead>
          <tbody>
            {componentRows.map((row) => (
              <tr key={row.name} className="border-t border-line align-top">
                <th scope="row" className="px-4 py-3 text-start font-semibold">
                  <bdi dir="ltr">{row.name}</bdi>
                </th>
                <td className="px-4 py-3">
                  <TierBadge tier={row.tier} />
                </td>
                <td className="px-4 py-3 text-fg-secondary">{row.note ? tn(row.note) : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </StyleguideSection>
  );
}

function PatternsSection() {
  const t = useTranslations("Styleguide.rulesPage.patterns");
  return (
    <StyleguideSection id="patterns" title={t("title")} description={t("description")}>
      <div className="grid gap-4 lg:grid-cols-2">
        {patternIds.map((id) => {
          const meta = patternMeta[id];
          return (
            <article key={id} aria-labelledby={`pattern-${id}`} className="flex flex-col gap-3 rounded-tile bg-subtle p-4">
              <header className="flex flex-wrap items-center justify-between gap-2">
                <h3 id={`pattern-${id}`} className="type-title">
                  {t(`${id}.title`)}
                </h3>
                <span
                  data-scope-kind={meta.scope}
                  className="inline-flex min-h-6 items-center rounded-pill border border-outline px-2.5 text-xs font-semibold text-fg-secondary"
                >
                  {t(`scopes.${meta.scope}`)}
                </span>
              </header>
              <dl className="flex flex-col gap-2 text-sm">
                <div>
                  <dt className="font-semibold text-success-text">{t("allowed")}</dt>
                  <dd className="text-fg-secondary">{t(`${id}.allowed`)}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-danger-text">{t("notAllowed")}</dt>
                  <dd className="text-fg-secondary">{t(`${id}.notAllowed`)}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-fg-muted">{t("evidence")}</dt>
                  <dd dir="ltr" className="text-start text-xs text-fg-muted rtl:text-end">
                    {meta.evidence}
                  </dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>
    </StyleguideSection>
  );
}

function OpenQuestionsSection() {
  const t = useTranslations("Styleguide.rulesPage.openQuestions");
  return (
    <StyleguideSection id="open-questions" title={t("title")} description={t("description")}>
      <ul className="flex flex-col gap-2">
        {openQuestionIds.map((id) => (
          <li key={id} className="rounded-row border border-dashed border-outline px-4 py-3 type-body text-fg-secondary">
            {t(`items.${id}`)}
          </li>
        ))}
      </ul>
    </StyleguideSection>
  );
}

/** /styleguide/rules: tiers, component classification and the pattern audit. */
function RulesViewContent() {
  const t = useTranslations("Styleguide");
  const [scope] = useState<Scope>("personal");
  return (
    <StyleguideShell
      current="rules"
      overline={t("rulesPage.overline")}
      title={t("rulesPage.title")}
      intro={t("rulesPage.intro")}
      scope={scope}
    >
      <TiersSection />
      <ClassificationSection />
      <PatternsSection />
      <OpenQuestionsSection />
    </StyleguideShell>
  );
}

export function RulesView() {
  return (
    <StyleguideMessages>
      <RulesViewContent />
    </StyleguideMessages>
  );
}
