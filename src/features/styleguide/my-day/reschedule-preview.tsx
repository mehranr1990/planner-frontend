"use client";

import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlannerNow } from "@/features/my-day/my-day-context";
import { ReschedulePanel } from "@/features/my-day/reschedule/reschedule-panel";
import { useRescheduleSession } from "@/features/my-day/reschedule/use-reschedule-session";

/*
 * The "Reschedule" state tile, static: the real panel (five rows, first one
 * selected) for one block, drawn inline instead of in a popover. `inert`
 * keeps it a picture: no focus, no clicks, out of the accessibility tree.
 * Needs the demo data stack and a My Day provider above it.
 */

export function ReschedulePreview({ blockId }: { blockId: string }) {
  const t = useTranslations("MyDay.reschedule");
  const now = usePlannerNow();
  const session = useRescheduleSession({ target: { kind: "block", id: blockId } });

  return (
    <div inert className="mx-auto flex w-full max-w-88 flex-col gap-3 rounded-tile border border-hairline bg-elevated p-4 text-fg shadow-elevated">
      {session.status === "ready" ? (
        <>
          <p className="pt-1.5 text-[0.9375rem] leading-snug font-bold text-fg">
            {t.rich("title", {
              title: session.resolved.title,
              bdi: (chunks) => <bdi dir="auto">{chunks}</bdi>,
            })}
          </p>
          <ReschedulePanel
            rows={session.rows}
            pickDefault={session.pickDefault}
            today={now.day}
            onChoose={() => undefined}
          />
        </>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Skeleton shape="row" />
          <Skeleton shape="row" />
          <Skeleton shape="row" />
        </div>
      )}
    </div>
  );
}
