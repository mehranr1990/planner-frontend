import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface PreviewFrameProps {
  /** Caption under the frame; also names the figure. */
  label?: ReactNode;
  children: ReactNode;
  /** Classes for the figure (width, grid placement). */
  className?: string;
  /** Classes for the framed canvas (layout of the preview). */
  contentClassName?: string;
}

/**
 * A canvas-coloured frame that contains a preview. It clips and scrolls its
 * own content, so wide or positioned previews never overflow the page.
 */
export function PreviewFrame({ label, children, className, contentClassName }: PreviewFrameProps) {
  return (
    <figure className={cn("flex min-w-0 flex-col gap-2", className)}>
      <div className={cn("relative min-w-0 overflow-auto rounded-tile border border-line bg-canvas p-4", contentClassName)}>
        {children}
      </div>
      {label ? <figcaption className="type-caption text-fg-muted">{label}</figcaption> : null}
    </figure>
  );
}

/** Small muted caption naming a state ("Default", "Disabled") under a sample. */
export function StateCaption({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("type-caption text-fg-muted", className)}>{children}</p>;
}

/** A labelled column inside a section ("Switches", "Checkboxes"). */
export function DemoGroup({ title, children, className }: { title: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-3", className)}>
      <h3 className="type-label text-fg-secondary">{title}</h3>
      {children}
    </div>
  );
}
