"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { getPlannerToday } from "@/data/clock";
import { useBlocks, useInboxCount, useTasks } from "@/data/queries";
import type { TaskView } from "@/data/repositories";
import { usePreferences } from "@/features/preferences/use-preferences";
import { formatNumber } from "@/lib/locale/digits";

/*
 * Seam probes for the skeleton pages: they read the route's search params and
 * the data hooks (mock repositories) so each route proves its wiring. Not
 * screen UI — the real screens replace them step by step.
 */

function ProbeRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <dt className="type-label text-fg-muted">{label}</dt>
      <dd className="text-sm text-fg">{children}</dd>
    </div>
  );
}

/** The search params this route understands, echoed back (`?view=board`). Needs a Suspense parent. */
export function SearchParamsProbe({ names }: { names: readonly string[] }) {
  const t = useTranslations("Personal.skeleton");
  const params = useSearchParams();
  const values = names.map((name) => [name, params.get(name)] as const).filter(([, value]) => value !== null);
  return (
    <dl data-probe="params">
      <ProbeRow label={t("params")}>
        <span dir="ltr" className="font-mono text-xs">
          {values.length > 0 ? values.map(([name, value]) => `${name}=${value}`).join(" · ") : `${names.join(" · ")}: ${t("none")}`}
        </span>
      </ProbeRow>
    </dl>
  );
}

/** Today's tasks from the tasks repository, as links to task detail (drawer on soft navigation). */
export function TaskLinksProbe({ view = "today" }: { view?: TaskView }) {
  const t = useTranslations("Personal.seams");
  const tasks = useTasks({ view });
  return (
    <section aria-labelledby="probe-tasks" data-probe="tasks" className="flex flex-col gap-2">
      <h2 id="probe-tasks" className="type-label text-fg-muted">
        {t("tasks")}
      </h2>
      {tasks.isPending ? (
        <p className="text-sm text-fg-muted">{t("loading")}</p>
      ) : tasks.isError ? (
        <p className="text-sm text-danger-text">{t("error")}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {tasks.data.map((task) => (
            <li key={task.id}>
              <Link
                href={`/personal/tasks/${task.id}`}
                className="inline-flex min-h-10 items-center rounded-row px-2 text-sm font-semibold text-fg hover:bg-subtle"
              >
                <bdi dir="auto">{task.title}</bdi>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Block count for a day from the blocks repository. */
export function BlocksProbe({ day }: { day?: string }) {
  const t = useTranslations("Personal.seams");
  const { digits } = usePreferences();
  const blocks = useBlocks(day ?? getPlannerToday());
  return (
    <p data-probe="blocks" className="text-sm text-fg">
      {blocks.data ? t("blocks", { count: formatNumber(blocks.data.length, digits) }) : t("loading")}
    </p>
  );
}

/** Untriaged inbox count (the rail badge) from the inbox repository. */
export function InboxCountProbe() {
  const t = useTranslations("Personal.seams");
  const { digits } = usePreferences();
  const count = useInboxCount();
  return (
    <p data-probe="inbox" className="text-sm text-fg">
      {count.data === undefined ? t("loading") : t("inbox", { count: formatNumber(count.data, digits) })}
    </p>
  );
}
