"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createDropRegistry, type DayColumnGeometry, type DropRegistry } from "./drag";

/*
 * Provides one DropRegistry to the DndContext controller and the timeline
 * columns beneath it. A column calls useRegisterDayColumn(geometry); the
 * controller reads useDropRegistry().
 */

const DropRegistryContext = createContext<DropRegistry | null>(null);

export function DropRegistryProvider({ children, registry }: { children: ReactNode; registry?: DropRegistry }) {
  const [value] = useState(() => registry ?? createDropRegistry());
  return <DropRegistryContext.Provider value={value}>{children}</DropRegistryContext.Provider>;
}

export function useDropRegistry(): DropRegistry {
  const registry = useContext(DropRegistryContext);
  if (!registry) throw new Error("useDropRegistry must be used inside <DropRegistryProvider>.");
  return registry;
}

/** Registers a day column while mounted. Pass a stable geometry (memoise it); it re-registers when it changes. */
export function useRegisterDayColumn(geometry: DayColumnGeometry): void {
  const registry = useDropRegistry();
  useEffect(() => registry.register(geometry), [registry, geometry]);
}
