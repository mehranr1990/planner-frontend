import type { Area, EstimateCategory } from "@/data/domain";

/*
 * Estimate buffers are keyed by stable ids only (the Insights estimate
 * category ids, area ids, label slugs) — never by localized display text.
 * Labels are free text, so a label is reduced to a slug, and the known
 * spellings of each category in any language map to its id. Domain data:
 * kept outside the UI and the translation files.
 */

const LABEL_ALIASES: Readonly<Record<string, EstimateCategory>> = {
  design: "design",
  طراحی: "design",
  admin: "admin",
  اداری: "admin",
  writing: "writing",
  نوشتن: "writing",
  نگارش: "writing",
  errands: "errands",
  errand: "errands",
  "کارهای بیرون": "errands",
};

/** A free-text label as a stable slug: trimmed, lower-case, one spacing, Persian letter forms unified. */
function slug(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[\u200c\u200e\u200f]/g, " ")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** A label's stable id: its estimate category when it names one in any language, else its slug. */
export function labelCategoryId(label: string): string {
  const key = slug(label);
  return Object.hasOwn(LABEL_ALIASES, key) ? LABEL_ALIASES[key]! : key;
}

/** The stable ids a task can be buffered by: its label ids and its area id (never the area name). */
export function planningTags(task: { labels?: readonly string[] | null; area?: Area | null }): string[] {
  const tags = (task.labels ?? []).map(labelCategoryId);
  if (task.area?.id) tags.push(task.area.id);
  return tags;
}
