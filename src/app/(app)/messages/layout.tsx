import { Suspense, type ReactNode } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { MessagesShell } from "@/features/messages/messages-shell";

/*
 * /messages (MS-01): global surface outside the four contexts; the
 * conversation list replaces the context rail. Reads the pathname and search
 * params, hence Suspense.
 */
export default function MessagesLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<AccessLoading />}>
      <MessagesShell>{children}</MessagesShell>
    </Suspense>
  );
}
