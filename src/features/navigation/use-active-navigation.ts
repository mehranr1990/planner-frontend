"use client";

import { usePathname } from "next/navigation";
import { getContextFromPathname, getNavItemForPathname } from "./paths";
import type { AppContext, NavItem } from "./types";

/*
 * Client hooks over usePathname(). With Cache Components, usePathname()
 * suspends below routes with unknown dynamic params, so wrap navigation that
 * renders in a shared layout in <Suspense> (see the Next.js usePathname docs).
 */

/** The context the URL is in, or undefined outside every context (e.g. "/"). */
export function useActiveContext(): AppContext | undefined {
  return getContextFromPathname(usePathname());
}

/** The nav item for the current URL, or undefined for an unknown route. */
export function useActiveNavItem(): NavItem | undefined {
  return getNavItemForPathname(usePathname())?.item;
}
