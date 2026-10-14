import { afterEach, beforeEach } from "vitest";

/**
 * jsdom cannot navigate; without the App Router mounted, a clicked <Link>
 * falls back to a document navigation and logs "Not implemented". A
 * document-level listener runs after React's root handler, so components
 * still see an un-prevented click.
 */
export function preventDocumentNavigation() {
  const prevent = (event: MouseEvent) => {
    if ((event.target as Element | null)?.closest?.("a[href]")) event.preventDefault();
  };
  beforeEach(() => document.addEventListener("click", prevent));
  afterEach(() => document.removeEventListener("click", prevent));
}
