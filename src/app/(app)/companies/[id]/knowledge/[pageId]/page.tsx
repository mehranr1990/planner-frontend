import { KnowledgeScreen } from "@/features/companies/knowledge/knowledge-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** CO-07 · Knowledge page: /companies/[id]/knowledge/[pageId] (the screen reads the page id from the path) (inside the company gate). */
export default function CompanyKnowledgePagePage() {
  return <KnowledgeScreen />;
}
