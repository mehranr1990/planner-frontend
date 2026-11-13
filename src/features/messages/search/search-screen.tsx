"use client";

import { History, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { AccessLoading, AccessState } from "@/components/feedback/access-state";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { PillGroup } from "@/components/ui/pills";
import { SearchField } from "@/components/ui/search-field";
import { Select, SelectItem } from "@/components/ui/select";
import type { MsgPerson, SearchFilters, SearchHit } from "@/data/messaging-domain";
import { useConversations, useMessageSearch } from "@/data/messaging-queries";
import { plainText } from "@/data/mock/mock-messaging";
import { useMsgFormat } from "../format";
import { channelsHref, messagesHref } from "../paths";
import { ConversationTitle, SourceChip } from "../visuals";

/*
 * MS-07 · /messages/search: only conversations you are a current member of,
 * only history visible to you (join date, delete-for-me, deletions for
 * everyone are excluded by the server). No admin search of anyone's direct
 * messages. Filters From · In · Has · Date; a result opens the conversation
 * scrolled to the message with a highlight (?m=). Recent searches stay on
 * this device only and can be cleared.
 */

const HISTORY_KEY = "mp-msg-search-history";
type Has = NonNullable<SearchFilters["has"]> | "any";

const EMPTY: string[] = [];
const historyListeners = new Set<() => void>();
let historyCache: { raw: string | null; list: string[] } = { raw: null, list: EMPTY };

function readHistory(): string[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (raw !== historyCache.raw) historyCache = { raw, list: raw ? (JSON.parse(raw) as string[]) : EMPTY };
    return historyCache.list;
  } catch {
    return EMPTY;
  }
}
function writeHistory(list: string[]) {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 8)));
  } catch {
    // Storage unavailable: history stays off.
  }
  historyListeners.forEach((listener) => listener());
}
/** Device-only search history (MS-07), read after hydration. */
function useSearchHistory(): string[] {
  return useSyncExternalStore(
    (listener) => {
      historyListeners.add(listener);
      return () => historyListeners.delete(listener);
    },
    readHistory,
    () => EMPTY,
  );
}

export function SearchScreen() {
  const t = useTranslations("Msg.search");
  const params = useSearchParams();
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState<string>("any");
  const [inId, setIn] = useState<string>(params.get("in") ?? "any");
  const [has, setHas] = useState<Has>("any");
  const [after, setAfter] = useState("");
  const [before, setBefore] = useState("");
  const history = useSearchHistory();
  const conversations = useConversations("all");
  const filters: SearchFilters = {
    ...(from !== "any" ? { from } : {}),
    ...(inId !== "any" ? { in: inId } : {}),
    ...(has !== "any" ? { has } : {}),
    ...(after ? { after } : {}),
    ...(before ? { before } : {}),
  };
  const results = useMessageSearch(query, filters);

  // "From" offers the authors found so far (only people visible to you).
  const authors = useMemo(() => {
    const list: MsgPerson[] = [];
    for (const hit of results.data ?? []) if (!hit.message.author.deleted && !list.some((p) => p.id === hit.message.author.id)) list.push(hit.message.author);
    return list;
  }, [results.data]);

  const run = (value: string) => {
    setQuery(value.trim());
    if (!value.trim()) return;
    writeHistory([value.trim(), ...history.filter((h) => h !== value.trim())]);
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="type-display">{t("title")}</h1>
      <form
        role="search"
        className="flex flex-col gap-3 rounded-[28px] bg-surface p-4 shadow-island"
        onSubmit={(e) => {
          e.preventDefault();
          run(draft);
        }}
      >
        <div className="flex gap-2">
          <SearchField value={draft} onValueChange={setDraft} aria-label={t("label")} placeholder={t("placeholder")} className="flex-1" />
          <Button type="submit">{t("submit")}</Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Select aria-label={t("from")} value={from} onValueChange={setFrom}>
            <SelectItem value="any">{t("fromAny")}</SelectItem>
            {authors.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </Select>
          <Select aria-label={t("in")} value={inId} onValueChange={setIn}>
            <SelectItem value="any">{t("inAny")}</SelectItem>
            {(conversations.data ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.kind === "channel" ? `# ${c.title}` : c.title}
              </SelectItem>
            ))}
          </Select>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            {t("after")}
            <Input type="date" value={after} onChange={(e) => setAfter(e.target.value)} dir="ltr" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            {t("before")}
            <Input type="date" value={before} onChange={(e) => setBefore(e.target.value)} dir="ltr" />
          </label>
        </div>
        <PillGroup<Has>
          label={t("has")}
          value={has}
          onValueChange={setHas}
          options={(["any", "file", "image", "voice", "link"] as const).map((value) => ({ value, label: t(`hasOptions.${value}`) }))}
        />
        <p className="text-xs text-fg-secondary">{t("scopeNote")}</p>
      </form>

      {!query && !Object.keys(filters).length ? (
        history.length ? (
          <section aria-labelledby="recent-title" className="flex flex-col gap-2 rounded-[22px] bg-surface p-4 shadow-island">
            <div className="flex items-center gap-2">
              <h2 id="recent-title" className="flex-1 text-sm font-bold">
                {t("recent")}
              </h2>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => writeHistory([])}
              >
                <Icon icon={X} size={14} />
                {t("clear")}
              </Button>
            </div>
            <ul className="flex flex-wrap gap-2">
              {history.map((h) => (
                <li key={h}>
                  <button type="button" onClick={() => (setDraft(h), run(h))} className="inline-flex items-center gap-1.5 rounded-pill bg-subtle px-3 py-1.5 text-sm">
                    <Icon icon={History} size={14} />
                    <bdi>{h}</bdi>
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-xs text-fg-secondary">{t("deviceOnly")}</p>
          </section>
        ) : (
          <p className="rounded-[22px] bg-surface p-6 text-sm text-fg-secondary shadow-island">{t("start")}</p>
        )
      ) : results.isPending ? (
        <AccessLoading />
      ) : results.isError ? (
        <AccessState kind="error" titleAs="h2" />
      ) : results.data.length === 0 ? (
        <AccessState kind="filtered" titleAs="h2" />
      ) : (
        <section aria-label={t("results", { count: results.data.length })} className="flex flex-col gap-2">
          <p className="text-xs font-bold text-fg-secondary" role="status">
            {t("results", { count: results.data.length })}
          </p>
          <ul className="flex flex-col gap-2">
            {results.data.map((hit) => (
              <li key={hit.message.id}>
                <SearchResult hit={hit} query={query} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function SearchResult({ hit, query }: { hit: SearchHit; query: string }) {
  const t = useTranslations("Msg");
  const f = useMsgFormat();
  const href = `${hit.kind === "channel" ? channelsHref(hit.source, hit.conversationId) : messagesHref.conversation(hit.conversationId)}?m=${encodeURIComponent(hit.message.id)}`;
  const text = plainText(hit.message.body) || hit.message.attachments.map((a) => a.name).join(", ");
  return (
    <Link href={href} className="flex flex-col gap-1 rounded-[22px] bg-surface p-4 shadow-island hover:bg-subtle">
      <span className="flex flex-wrap items-center gap-2 text-xs">
        <ConversationTitle kind={hit.kind} title={hit.conversationTitle} className="font-bold" />
        {hit.kind === "channel" ? <SourceChip source={hit.source} /> : null}
        <span className="flex-1" />
        <span className="text-fg-muted">{f.listTime(hit.message.createdAt)}</span>
      </span>
      <bdi className="text-xs font-bold text-fg-secondary">{hit.message.mine ? t("bubble.you") : hit.message.author.name || t("bubble.deletedUser")}</bdi>
      <span dir="auto" className="line-clamp-2 text-sm">
        {highlight(text, query)}
      </span>
    </Link>
  );
}

function highlight(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-warning-soft text-fg">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}
