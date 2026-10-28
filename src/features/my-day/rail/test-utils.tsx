import { DndContext, KeyboardSensor, useSensor, useSensors, type DragStartEvent } from "@dnd-kit/core";
import type { ReactElement, ReactNode } from "react";
import { vi } from "vitest";
import { DataProvider } from "@/data/provider";
import type { Repositories } from "@/data/repositories";
import { createMockRepositories, type MockRepositoriesOptions } from "@/data/mock";
import { renderWithProviders } from "@/test/render";
import type { Preferences } from "@/features/preferences/preferences-store";
import { MyDayProvider, type MyDayProviderProps } from "../my-day-context";

/** Tests only: pretend the viewport is (or is not) at the lg breakpoint. */
export function setDesktop(desktop: boolean) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: desktop,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

interface RailRenderOptions {
  desktop?: boolean;
  preferences?: Partial<Preferences>;
  /** A separate mock store (own fixtures / latency); default is the sample day. */
  mock?: MockRepositoriesOptions;
  /** Or a hand-made repositories object (e.g. one that fails). */
  repositories?: Repositories;
  provider?: Partial<Extract<MyDayProviderProps, { syncUrl: false }>>;
  onDragStart?: (event: DragStartEvent) => void;
}

/** What a real controller gives the rail: a DndContext with the keyboard sensor, inside the My Day state. */
export function renderRail(ui: ReactElement, options: RailRenderOptions = {}) {
  setDesktop(options.desktop ?? true);
  const repositories = options.repositories ?? (options.mock ? createMockRepositories(options.mock) : undefined);
  const dnd = (children: ReactNode) => <Dnd onDragStart={options.onDragStart}>{children}</Dnd>;
  const content = (
    <MyDayProvider syncUrl={false} {...options.provider}>
      {dnd(ui)}
    </MyDayProvider>
  );
  return renderWithProviders(repositories ? <DataProvider repositories={repositories}>{content}</DataProvider> : content, {
    preferences: options.preferences,
  });
}

function Dnd({ children, onDragStart }: { children: ReactNode; onDragStart?: (event: DragStartEvent) => void }) {
  const sensors = useSensors(useSensor(KeyboardSensor));
  return (
    <DndContext sensors={sensors} onDragStart={onDragStart}>
      {children}
    </DndContext>
  );
}
