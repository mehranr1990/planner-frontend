"use client";

import { ChevronLeft, ChevronRight, Download, ImagePlus, Lock, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { EmptyState } from "@/components/feedback/state-views";
import { Button, IconButton } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { ALBUM_MAX_BYTES, type Album, type Photo } from "@/data/social-domain";
import { socialKeys, useAlbums, usePhotos, useSocialMutation } from "@/data/social-queries";
import { useSocialRepository } from "@/data/social-provider";
import { useQueryClient } from "@tanstack/react-query";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { useSocialFormat } from "../format";
import { socialHref } from "../paths";
import { useSocialGroup } from "../social-gate";
import { queryGate, SocialPageHeader } from "../social-ui";
import { useSocialErrorText } from "../use-social";

/*
 * SO-11 · Album (/social/groups/[id]/album[/albumId]). Private to members
 * (no public links). Originals ≤ 20 MB each (rejected client-side and by the
 * server); display copies carry no location (S8). Upload with progress;
 * lightbox with previous / next (arrow keys), download original (uploader +
 * admins, setting) and remove (own photos; admins any, logged). Quota is
 * configured later in Admin (not enforced).
 */
export function AlbumScreen() {
  const { albumId } = useParams<{ albumId?: string }>();
  const group = useSocialGroup();
  const albums = useAlbums(group.id);
  const gate = queryGate([albums]);
  if (gate) return gate;
  const album = albumId ? albums.data!.find((a) => a.id === albumId) : undefined;
  if (albumId && !album) return <AccessLoading />;
  return album ? <AlbumPhotos album={album} /> : <AlbumList albums={albums.data!} />;
}

function Cover({ url, hue, alt }: { url: string | null; hue: number; alt: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- local object URLs of the mock upload
    <img src={url} alt={alt} className="size-full object-cover" />
  ) : (
    <span role="img" aria-label={alt} className="block size-full" style={{ background: `linear-gradient(135deg, hsl(${hue} 55% 72%), hsl(${(hue + 40) % 360} 50% 52%))` }} />
  );
}

function PrivacyLine() {
  const t = useTranslations("Social.album");
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-secondary">
      <span className="inline-flex items-center gap-1 font-semibold"><Icon icon={Lock} size={12} />{t("private")}</span>
      <span>{t("limit")}</span>
      <span>{t("locationNote")}</span>
    </p>
  );
}

function AlbumList({ albums }: { albums: Album[] }) {
  const t = useTranslations("Social.album");
  const tCommon = useTranslations("Social.common");
  const group = useSocialGroup();
  const format = useSocialFormat();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const create = useSocialMutation((repo, value: string) => repo.albums.create(group.id, value));
  return (
    <>
      <SocialPageHeader
        group={group}
        trail={[{ label: t("title") }]}
        title={t("title")}
        subtitle={<PrivacyLine />}
        actions={<Button className="gap-2" aria-haspopup="dialog" onClick={() => setCreating(true)}><Icon icon={Plus} size={16} />{t("newAlbum")}</Button>}
      />
      {albums.length === 0 ? (
        <EmptyState title={t("noAlbums")} description={t("emptyBody")} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {albums.map((a) => (
            <li key={a.id}>
              <Link href={socialHref.album(group.id, a.id)} className="flex flex-col overflow-hidden rounded-product bg-surface transition-colors hover:bg-subtle">
                <span className="block aspect-[4/3] overflow-hidden bg-subtle">{a.cover ? <Cover url={a.cover.url} hue={a.cover.hue} alt="" /> : null}</span>
                <span className="flex flex-col gap-0.5 p-4">
                  <bdi className="type-title text-fg">{a.title}</bdi>
                  <span className="text-xs text-fg-secondary">
                    {t("photos", { count: a.photoCount, n: format.number(a.photoCount) })}
                    {a.activity ? <> · <bdi>{a.activity.title}</bdi></> : null}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent title={t("newAlbum")}>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim()) return;
              create.mutate(name, { onSuccess: () => { setCreating(false); setName(""); } });
            }}
          >
            <Field>
              <FieldLabel>{t("albumName")}</FieldLabel>
              <Input dir="auto" value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setCreating(false)}>{tCommon("cancel")}</Button>
              <Button type="submit" disabled={!name.trim() || create.isPending}>{t("newAlbum")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AlbumPhotos({ album }: { album: Album }) {
  const t = useTranslations("Social.album");
  const group = useSocialGroup();
  const format = useSocialFormat();
  const photos = usePhotos(album.id);
  const repo = useSocialRepository();
  const client = useQueryClient();
  const errorText = useSocialErrorText();
  const [uploads, setUploads] = useState<{ name: string; progress: number }[]>([]);
  const [open, setOpen] = useState<number | null>(null);

  const upload = async (files: FileList) => {
    let added = 0;
    for (const file of Array.from(files)) {
      if (file.size > ALBUM_MAX_BYTES) {
        toast({ title: t("tooLarge", { name: file.name }), tone: "warning" });
        continue;
      }
      setUploads((list) => [...list, { name: file.name, progress: 0 }]);
      try {
        const url = typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : null;
        await repo.albums.upload(album.id, { name: file.name, bytes: file.size, url }, (p) => setUploads((list) => list.map((u) => (u.name === file.name ? { ...u, progress: p } : u))));
        added += 1;
      } catch (error) {
        toast({ title: errorText(error), tone: "danger" });
      } finally {
        setUploads((list) => list.filter((u) => u.name !== file.name));
      }
    }
    if (added > 0) toast({ title: t("uploaded"), tone: "success" });
    await client.invalidateQueries({ queryKey: socialKeys.all });
  };

  const list = photos.data ?? [];
  return (
    <>
      <SocialPageHeader
        group={group}
        trail={[{ label: t("title"), href: socialHref.group(group.id, "album") }, { label: album.title }]}
        title={<bdi>{album.title}</bdi>}
        titleAddon={<span className="text-sm font-semibold text-fg-secondary">{t("photos", { count: list.length, n: format.number(list.length) })}</span>}
        subtitle={<PrivacyLine />}
        actions={
          <label className="inline-flex min-h-touch cursor-pointer items-center gap-2 rounded-pill bg-primary px-5 text-sm font-semibold text-on-accent hover:bg-primary-hover focus-within:outline-2 focus-within:outline-offset-2">
            <Icon icon={ImagePlus} size={16} />
            {t("add")}
            <input type="file" accept="image/*" multiple className="sr-only" onChange={(event) => { if (event.target.files?.length) void upload(event.target.files); event.target.value = ""; }} />
          </label>
        }
      />
      {uploads.length > 0 ? (
        <ProductCard role="status" className="flex flex-col gap-2">
          {uploads.map((u) => (
            <div key={u.name} className="flex flex-col gap-1">
              <bdi className="text-xs font-semibold text-fg">{t("uploading", { name: u.name })}</bdi>
              <div className="h-1.5 overflow-hidden rounded-pill bg-subtle"><span className="block h-full bg-scope-deep transition-[inline-size]" style={{ inlineSize: `${u.progress * 100}%` }} /></div>
            </div>
          ))}
        </ProductCard>
      ) : null}
      {!photos.data ? (
        <AccessLoading />
      ) : list.length === 0 ? (
        <EmptyState title={t("empty")} description={t("emptyBody")} />
      ) : (
        <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
          {list.map((p, i) => (
            <li key={p.id}>
              <button type="button" aria-haspopup="dialog" onClick={() => setOpen(i)} className="block aspect-square w-full overflow-hidden rounded-row focus-visible:outline-2 focus-visible:outline-offset-2">
                <Cover url={p.url} hue={p.hue} alt={t("photoAlt", { name: p.name, by: p.uploader.name })} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {open !== null && list[open] ? <Lightbox photos={list} index={open} onIndex={setOpen} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function Lightbox({ photos, index, onIndex, onClose }: { photos: Photo[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const t = useTranslations("Social.album");
  const format = useSocialFormat();
  const p = photos[index]!;
  const remove = useSocialMutation((repo, id: string) => repo.albums.remove(id));
  const rtl = format.locale === "fa";
  const prev = () => onIndex((index - 1 + photos.length) % photos.length);
  const next = () => onIndex((index + 1) % photos.length);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") (rtl ? next : prev)();
      if (event.key === "ArrowRight") (rtl ? prev : next)();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return (
    <Dialog open onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent title={p.name} description={`${t("position", { i: format.number(index + 1), n: format.number(photos.length) })} · ${t("by", { name: p.uploader.name })}`} className="max-w-3xl">
        <div className="aspect-[4/3] overflow-hidden rounded-row bg-subtle">
          <Cover url={p.url} hue={p.hue} alt={t("photoAlt", { name: p.name, by: p.uploader.name })} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <IconButton icon={ChevronLeft} mirror label={t("prev")} onClick={prev} />
            <IconButton icon={ChevronRight} mirror label={t("next")} onClick={next} />
          </div>
          <div className="flex flex-wrap gap-2">
            {p.canDownloadOriginal && p.url ? (
              <Button asChild variant="secondary" className="gap-2"><a href={p.url} download={p.name}><Icon icon={Download} size={16} />{t("download")}</a></Button>
            ) : null}
            {p.canRemove ? (
              <Button
                variant="ghost"
                className="gap-2 text-danger-text"
                disabled={remove.isPending}
                onClick={() => remove.mutate(p.id, { onSuccess: () => { toast({ title: t("removed") }); onClose(); } })}
              >
                <Icon icon={Trash2} size={16} />
                {t("remove")}
              </Button>
            ) : null}
          </div>
        </div>
        <p className="text-xs text-fg-muted">{t("locationNote")}</p>
      </DialogContent>
    </Dialog>
  );
}
