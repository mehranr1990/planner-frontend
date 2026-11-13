import { Suspense, type ReactNode } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { SocialGroupGate } from "@/features/social/social-gate";

/*
 * Inside a social group (/social/groups/[id]/…, SO-01). The gate loads the
 * server's access answer: members see the pages; join requested, activity
 * guest, left and not available get their SH-02 states.
 */
export default function SocialGroupLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<AccessLoading />}>
      <SocialGroupGate>{children}</SocialGroupGate>
    </Suspense>
  );
}
