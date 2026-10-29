import type { Metadata } from "next";
import { Suspense } from "react";
import { FocusScreen } from "@/features/focus/focus-screen";
import { personalPageMetadata } from "@/features/personal/page-metadata";

export const instant = false;

export function generateMetadata(): Promise<Metadata> {
  return personalPageMetadata("focus");
}

export default function FocusPage() {
  return (
    <Suspense fallback={null}>
      <FocusScreen />
    </Suspense>
  );
}
