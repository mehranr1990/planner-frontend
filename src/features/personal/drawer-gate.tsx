"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { TASK_CREATE_HREF, TASKS_HREF } from "./routes";

/*
 * The @drawer slot keeps its last state on soft navigation, so the task
 * drawer is shown only while the URL is a task detail route. (A catch-all page
 * in the slot used to clear it, but that made the (app) tree claim every
 * /personal/* URL, shadowing the shell-less /personal/focus.)
 */
export function DrawerGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isTaskDetail =
    pathname.startsWith(`${TASKS_HREF}/`) && pathname !== TASK_CREATE_HREF && !pathname.slice(TASKS_HREF.length + 1).includes("/");
  return isTaskDetail ? children : null;
}
