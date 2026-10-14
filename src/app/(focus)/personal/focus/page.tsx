import type { Metadata } from "next";
import { Suspense } from "react";
import { FocusSkeleton } from "@/features/personal/focus-skeleton";
import { personalPageMetadata } from "@/features/personal/personal-skeleton";

export const instant = false;

export function generateMetadata(): Promise<Metadata> {
  return personalPageMetadata("focus");
}

export default function FocusPage() {
  return (
    <Suspense fallback={null}>
      <FocusSkeleton />
    </Suspense>
  );
}
