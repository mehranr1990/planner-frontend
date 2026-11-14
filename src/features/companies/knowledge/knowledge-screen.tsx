"use client";

import { Check, ChevronRight, FileText, Lock, Paperclip, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { EmptyState, ErrorState } from "@/components/feedback/state-views";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { SearchField } from "@/components/ui/search-field";
import { Select, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import type { KbFolder, KbPage } from "@/data/company-domain";
import { useCompanyMutation, useKbFolders, useKbPage, useKbPages, useKbSearch, useKbVersionBody } from "@/data/company-queries";
import { RepositoryError } from "@/data/repositories";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { companyHref } from "@/features/navigation/contexts";
import { cn } from "@/lib/cn";
import { useCompany, useCompanyWritable } from "../company-gate";
import { CompanyPageHeader } from "../company-page-header";
import { useCompanyFormat } from "../format";

/*
 * CO-07 · Knowledge base (/companies/[id]/knowledge[/pageId]). Private to
 * the company: folders and pages with versions and attached files.
 * Restricted folders (e.g. HR) are listed only for people with access;
 * search covers only readable items and never shows a snippet from an
 * unreadable one. Pages use the same plain-text editor as Personal notes;
 * version history with a diff; restore = a new version. Optional
 * "acknowledge required" per page version with the acknowledged count and
 * one reminder per version. Product cards only (no notch on reading pages).
 */

export function KnowledgeScreen() {
  const t = useTranslations("Company.knowledge");
  const { company, capabilities } = useCompany();
  const writable = useCompanyWritable();
  const pathname = usePathname();
  const pageId = /\/knowledge\/([^/?#]+)/.exec(pathname)?.[1];
  const folders = useKbFolders(company.id);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const header = (
    <CompanyPageHeader
      module="knowledge"
      title={t("title")}
      actions={
        <>
          <SearchBox query={query} onQuery={setQuery} />
          {capabilities.createKbPage && writable ? (
            <Button className="gap-2" onClick={() => setCreating(true)}>
              <Icon icon={Plus} size={16} />
              {t("newPage")}
            </Button>
          ) : null}
        </>
      }
    />
  );

  if (folders.isError) {
    return (
      <>
        {header}
        <ErrorState onRetry={() => void folders.refetch()} />
      </>
    );
  }
  if (!folders.data) {
    return (
      <>
        {header}
        <AccessLoading />
      </>
    );
  }
  if (folders.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState icon={FileText} title={t("empty.title")} description={t("empty.body")} />
      </>
    );
  }

  return (
    <>
      {header}
      {query.trim() ? <SearchResults query={query} onPick={() => setQuery("")} /> : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_minmax(0,18rem)]">
        <FolderTree folders={folders.data} pageId={pageId} />
        <PageReader folders={folders.data} pageId={pageId} />
      </div>
      {creating ? <CreatePageDialog folders={folders.data} onClose={() => setCreating(false)} /> : null}
    </>
  );
}

function SearchBox({ query, onQuery }: { query: string; onQuery: (value: string) => void }) {
  const t = useTranslations("Company.knowledge");
  return <SearchField value={query} onValueChange={onQuery} aria-label={t("search")} placeholder={t("search")} className="w-full sm:w-72" />;
}

function SearchResults({ query, onPick }: { query: string; onPick: () => void }) {
  const t = useTranslations("Company.knowledge");
  const { company } = useCompany();
  const results = useKbSearch(company.id, query);
  return (
    <ProductCard as="section" aria-label={t("results")} padding="compact" className="gap-1">
      {!results.data ? (
        <AccessLoading />
      ) : results.data.length === 0 ? (
        <p className="px-2 py-3 text-sm text-fg-muted">{t("noResults")}</p>
      ) : (
        <ul className="flex flex-col">
          {results.data.map((hit) => (
            <li key={`${hit.kind}-${hit.id}`}>
              <Link
                href={`${companyHref(company.id, "knowledge")}/${hit.pageId}`}
                onClick={onPick}
                className="flex items-start gap-3 rounded-row px-3 py-2 hover:bg-subtle"
              >
                <Icon icon={hit.kind === "file" ? Paperclip : FileText} size={15} className="mt-0.5 shrink-0 text-fg-secondary" />
                <span className="flex min-w-0 flex-col">
                  <bdi className="truncate text-sm font-bold text-fg">{hit.title}</bdi>
                  <span className="truncate text-xs text-fg-secondary">
                    <bdi>{hit.folderName}</bdi> · <bdi>{hit.snippet}</bdi>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="px-2 pb-1 text-xs text-fg-muted">{t("searchNote")}</p>
    </ProductCard>
  );
}

function FolderTree({ folders, pageId }: { folders: KbFolder[]; pageId: string | undefined }) {
  const t = useTranslations("Company.knowledge");
  const { company } = useCompany();
  const format = useCompanyFormat(company.currency);
  const page = useKbPage(company.id, pageId);
  const [open, setOpen] = useState<string | null>(null);
  const openFolder = open ?? page.data?.folderId ?? folders[0]?.id ?? null;
  const roots = folders.filter((folder) => folder.parentId === null);
  const render = (folder: KbFolder, depth: number) => {
    const children = folders.filter((item) => item.parentId === folder.id);
    return (
      <li key={folder.id}>
        <button
          type="button"
          aria-expanded={openFolder === folder.id}
          onClick={() => setOpen(openFolder === folder.id ? "" : folder.id)}
          className={cn(
            "flex min-h-10 w-full items-center gap-2 rounded-row px-2 text-start text-sm transition-colors hover:bg-subtle",
            openFolder === folder.id && "bg-subtle",
          )}
          style={{ paddingInlineStart: `${0.5 + depth}rem` }}
        >
          <Icon icon={folder.restricted ? Lock : FileText} size={15} className="shrink-0 text-scope-deep" />
          <bdi className="min-w-0 flex-1 truncate font-bold text-fg">{folder.name}</bdi>
          {folder.restricted ? <span className="sr-only">{t("restricted")}</span> : null}
          <span className="text-xs font-semibold tabular text-fg-muted">{format.number(folder.pages)}</span>
        </button>
        {openFolder === folder.id ? <FolderPages folderId={folder.id} pageId={pageId} depth={depth + 1} /> : null}
        {children.length > 0 ? <ul>{children.map((child) => render(child, depth + 1))}</ul> : null}
      </li>
    );
  };
  return (
    <ProductCard as="section" aria-label={t("folders")} padding="compact" className="self-start">
      <ul className="flex flex-col gap-0.5">{roots.map((folder) => render(folder, 0))}</ul>
    </ProductCard>
  );
}

function FolderPages({ folderId, pageId, depth }: { folderId: string; pageId: string | undefined; depth: number }) {
  const { company } = useCompany();
  const pages = useKbPages(company.id, folderId);
  return (
    <ul className="flex flex-col gap-0.5 py-0.5">
      {(pages.data ?? []).map((page) => (
        <li key={page.id}>
          <Link
            href={`${companyHref(company.id, "knowledge")}/${page.id}`}
            aria-current={page.id === pageId ? "page" : undefined}
            className="flex min-h-10 items-center gap-2 rounded-row px-2 text-sm text-fg hover:bg-subtle aria-[current]:bg-scope-soft aria-[current]:font-bold aria-[current]:text-scope-deep aria-[current]:inset-ring-[1.5px] aria-[current]:inset-ring-scope-deep"
            style={{ paddingInlineStart: `${0.75 + depth}rem` }}
          >
            <Icon icon={FileText} size={14} className="shrink-0 text-fg-secondary" />
            <bdi className="min-w-0 flex-1 truncate">{page.title}</bdi>
            {page.ackRequired && !page.acknowledged ? <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-scope-dot" /> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function PageReader({ folders, pageId }: { folders: KbFolder[]; pageId: string | undefined }) {
  const t = useTranslations("Company.knowledge");
  const { company } = useCompany();
  const firstFolder = folders.find((folder) => folder.parentId === null);
  const firstPages = useKbPages(company.id, pageId ? undefined : firstFolder?.id);
  const resolvedId = pageId ?? firstPages.data?.[0]?.id;
  const page = useKbPage(company.id, resolvedId);
  if (!resolvedId) return firstPages.data ? <EmptyState icon={FileText} title={t("noPage")} /> : <AccessLoading />;
  if (page.isError) return <ErrorState onRetry={() => void page.refetch()} />;
  if (page.data === undefined) return <AccessLoading />;
  // Unreadable or missing: same answer, no discovery.
  if (page.data === null) return <EmptyState icon={Lock} title={t("notAvailable")} />;
  return <PageView key={`${page.data.id}-${page.data.version}`} page={page.data} folders={folders} />;
}

function paragraphs(body: string) {
  return body.split(/\n{2,}/).filter((part) => part.trim());
}

function PageView({ page, folders }: { page: KbPage; folders: KbFolder[] }) {
  const t = useTranslations("Company.knowledge.page");
  const { company, capabilities } = useCompany();
  const writable = useCompanyWritable();
  const format = useCompanyFormat(company.currency);
  const folder = folders.find((item) => item.id === page.folderId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(page.body);
  const [note, setNote] = useState("");
  const [diffVersion, setDiffVersion] = useState<number | null>(null);
  const save = useCompanyMutation(company.id, (repo, id, vars: { body: string; note: string }) => repo.kbSave(id, page.id, vars.body, vars.note));
  const restore = useCompanyMutation(company.id, (repo, id, version: number) => repo.kbRestore(id, page.id, version));
  const ack = useCompanyMutation(company.id, (repo, id) => repo.kbAck(id, page.id));
  const remind = useCompanyMutation(company.id, (repo, id) => repo.kbRemind(id, page.id));
  const old = useKbVersionBody(company.id, page.id, diffVersion);
  const canEdit = writable && page.canEdit && capabilities.createKbPage;

  return (
    <>
      <ProductCard as="article" aria-labelledby="kb-title" className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-1 text-fg-secondary">
            <bdi className="underline underline-offset-2">{folder?.name}</bdi>
            <Icon icon={ChevronRight} size={12} mirror />
            <bdi className="font-semibold text-fg">{page.title}</bdi>
          </span>
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-pill px-2.5 py-1 font-bold text-fg inset-ring inset-ring-outline">
              {t("version", { v: page.version, date: format.day(page.updatedAt.slice(0, 10)) })}
            </span>
            {page.ackRequired ? (
              <span className="inline-flex items-center gap-1 rounded-pill bg-scope-soft px-2.5 py-1 font-bold text-scope-deep">
                <Icon icon={Check} size={12} />
                {t("ackRequired")}
              </span>
            ) : null}
          </span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id="kb-title" className="type-h1 text-fg">
              <bdi>{page.title}</bdi>
            </h2>
            <p className="text-xs font-semibold text-fg-secondary">{t("meta", { by: page.updatedBy, date: format.day(page.updatedAt.slice(0, 10), "full") })}</p>
          </div>
          {canEdit && !editing ? (
            <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => setEditing(true)}>
              <Icon icon={Pencil} size={14} />
              {t("edit")}
            </Button>
          ) : null}
        </div>
        {editing ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate(
                { body: draft, note },
                {
                  onSuccess: () => {
                    toast({ title: t("saved", { v: page.version + 1 }) });
                    setEditing(false);
                  },
                },
              );
            }}
          >
            <Field>
              <FieldLabel>{t("body")}</FieldLabel>
              <Textarea dir="auto" rows={10} value={draft} onChange={(event) => setDraft(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel>{t("changeNote")}</FieldLabel>
              <Input dir="auto" value={note} onChange={(event) => setNote(event.target.value)} />
            </Field>
            {page.ackRequired ? <p className="text-xs text-fg-secondary">{t("newVersionAck")}</p> : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setEditing(false);
                  setDraft(page.body);
                }}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={save.isPending || draft === page.body}>
                {t("save")}
              </Button>
            </div>
          </form>
        ) : (
          <div dir="auto" className="flex flex-col gap-3 text-sm leading-relaxed text-fg">
            {paragraphs(page.body).map((paragraph, index) => (
              <p key={index} className="whitespace-pre-line">
                {paragraph}
              </p>
            ))}
          </div>
        )}
        {page.ackRequired ? (
          <div className="flex flex-wrap items-center gap-3 rounded-row bg-scope-soft/60 px-4 py-3">
            <Icon icon={Check} size={16} className="shrink-0 text-scope-deep" />
            <p className="min-w-0 flex-1 text-sm font-semibold text-fg">
              {t("ackCount", { n: format.number(page.ackCount), total: format.number(page.audience), v: page.version })}
            </p>
            {!page.acknowledged && writable ? (
              <Button size="sm" disabled={ack.isPending} onClick={() => ack.mutate(undefined, { onSuccess: () => toast({ title: t("acked") }) })}>
                {t("acknowledge")}
              </Button>
            ) : page.acknowledged ? (
              <span className="text-xs font-bold text-scope-deep">{t("youAcked")}</span>
            ) : null}
            {capabilities.manageKb && writable ? (
              <Button
                size="sm"
                variant="secondary"
                className="bg-surface"
                disabled={remind.isPending || page.remindedVersion === page.version}
                onClick={() =>
                  remind.mutate(undefined, {
                    onSuccess: () => toast({ title: t("reminded") }),
                    onError: (error) => {
                      if (error instanceof RepositoryError && error.code === "conflict") toast({ title: t("remindedAlready") });
                    },
                  })
                }
              >
                {page.remindedVersion === page.version ? t("remindedOnce") : t("remind")}
              </Button>
            ) : null}
          </div>
        ) : null}
        {diffVersion !== null ? (
          <section aria-label={t("diffTitle", { v: diffVersion })} className="flex flex-col gap-2 rounded-row px-4 py-3 inset-ring inset-ring-line">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-fg">{t("diffTitle", { v: diffVersion })}</h3>
              <Button size="sm" variant="ghost" onClick={() => setDiffVersion(null)}>
                {t("closeDiff")}
              </Button>
            </div>
            {old.data === undefined ? (
              <AccessLoading />
            ) : (
              <Diff before={old.data} after={page.body} />
            )}
          </section>
        ) : null}
      </ProductCard>
      <ProductCard as="aside" aria-labelledby="kb-versions" className="gap-3 self-start lg:col-span-2 xl:col-span-1">
        <h2 id="kb-versions" className="type-title text-fg">
          {t("versions")}
        </h2>
        <ul className="flex flex-col gap-1.5">
          {page.versions.map((version) => (
            <li key={version.version} className="flex items-center gap-2 text-sm">
              <span
                className={cn(
                  "shrink-0 rounded-pill px-2 py-0.5 text-xs font-bold",
                  version.version === page.version ? "bg-scope-soft text-scope-deep" : "inset-ring inset-ring-outline text-fg",
                )}
              >
                v{version.version}
              </span>
              <bdi className="min-w-0 flex-1 truncate font-semibold text-fg">{version.note}</bdi>
              {version.version === page.version ? (
                <span className="shrink-0 text-xs text-fg-muted">{format.day(version.at.slice(0, 10))}</span>
              ) : (
                <span className="flex shrink-0 gap-1">
                  <button type="button" onClick={() => setDiffVersion(version.version)} className="rounded-pill px-2 py-1 text-xs font-bold text-scope-deep hover:bg-subtle">
                    {t("compare")}
                  </button>
                  {canEdit ? (
                    <button
                      type="button"
                      disabled={restore.isPending}
                      onClick={() => restore.mutate(version.version, { onSuccess: () => toast({ title: t("restored", { v: version.version }) }) })}
                      className="rounded-pill px-2 py-1 text-xs font-bold text-fg hover:bg-subtle"
                      aria-label={t("restoreLabel", { v: version.version })}
                    >
                      {t("restore")}
                    </button>
                  ) : null}
                </span>
              )}
            </li>
          ))}
        </ul>
        {page.files.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <h3 className="text-xs font-bold tracking-wide text-fg-secondary uppercase">{t("files")}</h3>
            <ul className="flex flex-col gap-1.5">
              {page.files.map((file) => (
                <li key={file.id} className="flex items-center gap-2 rounded-row bg-subtle px-3 py-2 text-xs font-semibold text-fg">
                  <Icon icon={Paperclip} size={13} className="shrink-0 text-fg-secondary" />
                  <bdi className="min-w-0 flex-1 truncate">{file.name}</bdi>
                  <span className="text-fg-muted">{file.size}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-bold tracking-wide text-fg-secondary uppercase">{t("access")}</h3>
          <p className="text-xs text-fg">{folder?.restricted ? t("accessRestricted") : t("accessAll")}</p>
          <p className="text-xs text-fg">{t("accessEdit", { by: page.updatedBy })}</p>
        </div>
      </ProductCard>
    </>
  );
}

/** Paragraph-level diff: removed paragraphs struck through, added ones highlighted. */
function Diff({ before, after }: { before: string; after: string }) {
  const t = useTranslations("Company.knowledge.page");
  const old = paragraphs(before);
  const next = paragraphs(after);
  const removed = old.filter((part) => !next.includes(part));
  const added = next.filter((part) => !old.includes(part));
  if (removed.length + added.length === 0) return <p className="text-xs text-fg-muted">{t("noChanges")}</p>;
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {removed.map((part) => (
        <li key={`-${part}`} className="rounded-row bg-danger-soft px-3 py-1.5 text-danger-text line-through">
          <span className="sr-only">{t("removed")} </span>
          {part}
        </li>
      ))}
      {added.map((part) => (
        <li key={`+${part}`} className="rounded-row bg-success-soft px-3 py-1.5 text-success-text">
          <span className="sr-only">{t("added")} </span>
          {part}
        </li>
      ))}
    </ul>
  );
}

function CreatePageDialog({ folders, onClose }: { folders: KbFolder[]; onClose: () => void }) {
  const t = useTranslations("Company.knowledge.create");
  const { company } = useCompany();
  const [folderId, setFolderId] = useState(folders[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [touched, setTouched] = useState(false);
  const create = useCompanyMutation(company.id, (repo, id, vars: { folderId: string; title: string; body: string }) => repo.kbCreate(id, vars));
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent title={t("title")}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setTouched(true);
            if (!title.trim() || !folderId) return;
            create.mutate(
              { folderId, title, body },
              {
                onSuccess: (page) => {
                  toast({ title: t("created", { title: page.title }) });
                  onClose();
                },
              },
            );
          }}
        >
          <Field>
            <FieldLabel>{t("folder")}</FieldLabel>
            <Select value={folderId} onValueChange={setFolderId}>
              {folders.map((folder) => (
                <SelectItem key={folder.id} value={folder.id}>
                  {folder.name}
                </SelectItem>
              ))}
            </Select>
          </Field>
          <Field invalid={touched && !title.trim()}>
            <FieldLabel>{t("pageTitle")}</FieldLabel>
            <Input dir="auto" autoFocus value={title} onChange={(event) => setTitle(event.target.value)} />
            {touched && !title.trim() ? <FieldError>{t("titleRequired")}</FieldError> : null}
          </Field>
          <Field>
            <FieldLabel>{t("body")}</FieldLabel>
            <Textarea dir="auto" rows={6} value={body} onChange={(event) => setBody(event.target.value)} />
          </Field>
          {create.isError ? <InlineAlert tone="danger" title={t("failed")} /> : null}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
