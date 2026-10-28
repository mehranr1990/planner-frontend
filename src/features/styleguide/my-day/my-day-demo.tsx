"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { MyDayScreen } from "@/features/my-day/my-day-screen";
import { SheetHost } from "@/features/sheets/sheet-host";
import { myDayStateNow } from "@/fixtures/personal/my-day-states";
import { MyDayDemoData } from "./demo-data";
import { parseMyDayDemoParams } from "./demo-params";

/*
 * The full-viewport My Day demo (/styleguide/my-day): the real screen without
 * the app shell, on one demo state's isolated data. See demo-params.ts for
 * the URL. Remounts when the state changes so each state starts clean.
 */

function MyDayDemoContent() {
  const { state, rescheduleBlockId, view } = parseMyDayDemoParams(useSearchParams());
  return (
    <MyDayDemoData key={state} state={state}>
      <MyDayScreen
        key={`${state}:${rescheduleBlockId ?? ""}:${view}`}
        demo={{
          now: myDayStateNow(state),
          initialView: view,
          initialReschedule: rescheduleBlockId ? { target: { kind: "block", id: rescheduleBlockId } } : undefined,
        }}
      />
      {/* Add block and the other ?sheet= flows open here as they do on Personal routes. */}
      <Suspense fallback={null}>
        <SheetHost />
      </Suspense>
    </MyDayDemoData>
  );
}

export function MyDayDemo() {
  return (
    <div data-scope="personal" data-demo="my-day" className="min-h-dvh bg-canvas text-fg">
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-360 flex-col gap-5 px-gutter pt-[calc(var(--safe-top)+1rem)] pb-[calc(2rem+var(--safe-bottom))] lg:px-5"
      >
        <Suspense fallback={null}>
          <MyDayDemoContent />
        </Suspense>
      </main>
    </div>
  );
}
