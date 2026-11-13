import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/*
 * Bounded rich text (MS-05): **bold**, _italic_, `code`, "- " list lines,
 * http(s) links and @[Name](personId) mentions. Parsed into React nodes —
 * never HTML — so message text can't inject markup. Lines get dir="auto"
 * (mixed Persian / Latin).
 */

const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|(?:^|(?<=\s))_[^_]+_|@\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s<>"]+)/g;

function inline(text: string, meId: string | undefined, keyPrefix: string): ReactNode[] {
  return text.split(TOKEN).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (!part) return null;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
      return (
        <code key={key} dir="ltr" className="rounded-sm bg-black/5 px-1 font-mono text-[0.85em] dark:bg-white/10">
          {part.slice(1, -1)}
        </code>
      );
    if (part.startsWith("_") && part.endsWith("_") && part.length > 2) return <em key={key}>{part.slice(1, -1)}</em>;
    const mention = /^@\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (mention)
      return (
        <span key={key} data-mention={mention[2]} className={cn("font-bold", mention[2] === meId ? "text-scope-deep" : undefined)}>
          @<bdi>{mention[1]}</bdi>
        </span>
      );
    if (/^https?:\/\//.test(part))
      return (
        <a key={key} href={part} target="_blank" rel="noopener noreferrer nofollow" dir="ltr" className="underline underline-offset-2 break-all">
          {part}
        </a>
      );
    return <Fragment key={key}>{part}</Fragment>;
  });
}

export function RichText({ body, meId, className }: { body: string; meId?: string; className?: string }) {
  const lines = body.split("\n");
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = (key: number) => {
    if (!list.length) return;
    blocks.push(
      <ul key={`ul-${key}`} className="list-disc ps-5">
        {list.map((item, i) => (
          <li key={i} dir="auto">
            {inline(item, meId, `li-${key}-${i}`)}
          </li>
        ))}
      </ul>,
    );
    list = [];
  };
  lines.forEach((line, i) => {
    if (/^[-•] /.test(line)) {
      list.push(line.slice(2));
      return;
    }
    flush(i);
    blocks.push(
      <p key={`p-${i}`} dir="auto" className="min-h-[1lh] whitespace-pre-wrap break-words">
        {inline(line, meId, `p-${i}`)}
      </p>,
    );
  });
  flush(lines.length);
  return <div className={cn("flex flex-col", className)}>{blocks}</div>;
}

/** First http(s) link in a draft (link preview offer). */
export function firstLink(body: string): string | null {
  return /https?:\/\/[^\s<>"]+/.exec(body)?.[0] ?? null;
}

/** Wraps the textarea selection with a marker (composer formatting buttons). */
export function wrapSelection(value: string, start: number, end: number, marker: "**" | "_" | "`" | "- "): { value: string; caret: number } {
  if (marker === "- ") {
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    return { value: `${value.slice(0, lineStart)}- ${value.slice(lineStart)}`, caret: end + 2 };
  }
  const selected = value.slice(start, end);
  return { value: `${value.slice(0, start)}${marker}${selected}${marker}${value.slice(end)}`, caret: end + marker.length * (selected ? 2 : 1) };
}
