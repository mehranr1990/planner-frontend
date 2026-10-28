import { Suspense, type ReactNode } from "react";
import { DrawerGate } from "@/features/personal/drawer-gate";
import { SheetHost } from "@/features/sheets/sheet-host";

/*
 * Personal routes (P00PersonalIA). `drawer` is the @drawer parallel slot:
 * a soft navigation to /personal/tasks/:id is intercepted there and drawn as
 * the P06 drawer over the current page; a hard navigation renders the full
 * page route instead (the slot falls back to default.tsx = nothing).
 * DrawerGate clears the slot on any other route.
 * The sheet host serves ?sheet=… on every Personal route (P18).
 */
export default function PersonalLayout({ children, drawer }: { children: ReactNode; drawer: ReactNode }) {
  return (
    <>
      {children}
      <DrawerGate>{drawer}</DrawerGate>
      <Suspense fallback={null}>
        <SheetHost />
      </Suspense>
    </>
  );
}
