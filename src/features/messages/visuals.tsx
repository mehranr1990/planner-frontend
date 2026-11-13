import { Hash, Users } from "lucide-react";
import type { ConversationKind, MsgPerson, MsgSource } from "@/data/messaging-domain";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { sourceScope } from "./paths";

/*
 * Source colour (owner decision): Direct & groups neutral slate, project
 * channels blue, team indigo, company purple. Avatars and chips carry
 * data-scope so tokens resolve per source in light and dark.
 */

export function ConversationAvatar({
  kind,
  initials,
  source,
  size = 40,
  className,
}: {
  kind: ConversationKind;
  initials: string;
  source: MsgSource;
  size?: 32 | 40 | 48;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      data-scope={sourceScope(source)}
      className={cn(
        "grid shrink-0 place-items-center rounded-pill bg-scope-soft font-bold text-scope-deep dark:muted-on-tint",
        size === 32 ? "size-8 text-[11px]" : size === 40 ? "size-10 text-xs" : "size-12 text-sm",
        className,
      )}
    >
      {kind === "group" && !initials ? <Icon icon={Users} size={18} /> : kind === "channel" && size === 48 ? <Icon icon={Hash} size={20} /> : initials}
    </span>
  );
}

export function PersonAvatar({ person, size = 32, className }: { person: MsgPerson; size?: 32 | 40; className?: string }) {
  return (
    <span
      aria-hidden
      data-scope="messages"
      className={cn(
        "grid shrink-0 place-items-center rounded-pill bg-scope-soft font-bold text-scope-deep dark:muted-on-tint",
        size === 32 ? "size-8 text-[11px]" : "size-10 text-xs",
        person.deleted && "opacity-60",
        className,
      )}
    >
      {person.deleted ? "?" : person.initials}
    </span>
  );
}

/** "● Website Redesign" — workspace source of a channel / meeting / announcement. */
export function SourceChip({ source, label, className }: { source: MsgSource; label?: string; className?: string }) {
  const text = label ?? source.name;
  if (!text) return null;
  return (
    <span
      data-scope={sourceScope(source)}
      className={cn("inline-flex max-w-full items-center gap-1.5 rounded-pill bg-scope-soft px-2.5 py-0.5 text-xs font-bold text-scope-deep dark:muted-on-tint", className)}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-pill bg-scope-deep" />
      <bdi className="truncate">{text}</bdi>
    </span>
  );
}

/** "# name" for channels, the plain title otherwise. */
export function ConversationTitle({ kind, title, className }: { kind: ConversationKind; title: string; className?: string }) {
  return (
    <bdi className={cn("truncate", className)}>
      {kind === "channel" ? "# " : null}
      {title}
    </bdi>
  );
}
