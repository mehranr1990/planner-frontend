"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { RemovableChip, ToggleChip } from "@/components/ui/chip";
import { Field, FieldLabel } from "@/components/ui/field";
import { SearchField } from "@/components/ui/search-field";
import { Select, SelectItem } from "@/components/ui/select";
import { labelOptions, priorityOptions, type LabelValue } from "../../component-samples";
import { DemoGroup } from "../../preview-frame";
import { StyleguideSection } from "../../styleguide-section";

/** Select with dot options, multi-select chips and the ⌘K search field. */
export function SelectSection() {
  const t = useTranslations("Styleguide.components.select");
  const [labels, setLabels] = useState<readonly LabelValue[]>(["ui", "dashboard"]);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const toggle = (label: LabelValue, selected: boolean) =>
    setLabels((current) =>
      selected ? labelOptions.filter((option) => option === label || current.includes(option)) : current.filter((item) => item !== label),
    );

  // ⌘K / Ctrl+K focuses the sample search field, as the shell's search will.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <StyleguideSection tier="utility" id="select" span="third" title={t("title")} description={t("description")}>
      <Field>
        <FieldLabel>{t("priority")}</FieldLabel>
        <Select defaultValue="high">
          {priorityOptions.map((option) => (
            <SelectItem key={option.value} value={option.value} dotClassName={option.dot}>
              {t(`priorities.${option.value}`)}
            </SelectItem>
          ))}
        </Select>
      </Field>

      <DemoGroup title={t("labels")}>
        <div role="group" aria-label={t("labels")} className="flex flex-wrap gap-2 rounded-tile border-[1.5px] border-outline p-2.5">
          {labelOptions.map((label) => (
            <ToggleChip
              key={label}
              selected={labels.includes(label)}
              onSelectedChange={(selected) => toggle(label, selected)}
            >
              {t(`labelNames.${label}`)}
            </ToggleChip>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <p className="type-caption text-fg-muted">{t("selected")}</p>
          {labels.length > 0 ? (
            <ul className="flex flex-wrap gap-2" aria-label={t("selected")}>
              {labels.map((label) => (
                <li key={label}>
                  <RemovableChip label={t(`labelNames.${label}`)} onRemove={() => toggle(label, false)} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="type-caption text-fg-secondary">{t("noneSelected")}</p>
          )}
        </div>
      </DemoGroup>

      <DemoGroup title={t("search")}>
        <SearchField
          ref={searchRef}
          value={query}
          onValueChange={setQuery}
          aria-label={t("searchLabel")}
          placeholder={t("searchPlaceholder")}
          shortcut="⌘K"
          aria-keyshortcuts="Meta+K Control+K"
        />
        <p className="type-caption text-fg-muted">{t("searchHint")}</p>
      </DemoGroup>
    </StyleguideSection>
  );
}
