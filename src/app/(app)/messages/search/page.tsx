import { Suspense } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { SearchScreen } from "@/features/messages/search/search-screen";

export const instant = false;

/** MS-07 · /messages/search (?in=<conversation>). */
export default function MessageSearchPage() {
  return (
    <Suspense fallback={<AccessLoading />}>
      <SearchScreen />
    </Suspense>
  );
}
