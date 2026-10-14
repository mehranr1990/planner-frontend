"use client";

import { Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  useRef,
  useState,
  type ChangeEvent,
  type ComponentProps,
  type KeyboardEvent,
  type Ref,
} from "react";
import { cn } from "@/lib/cn";
import { useFieldControl } from "./field";
import { Icon } from "./icon";

export interface SearchFieldProps extends Omit<ComponentProps<"input">, "type" | "size" | "value" | "defaultValue"> {
  value?: string;
  defaultValue?: string;
  /** Convenience over onChange: receives the new text (also "" on clear). */
  onValueChange?: (value: string) => void;
  /**
   * Visual shortcut hint shown while empty, e.g. "⌘K" (always LTR). Pair it
   * with aria-keyshortcuts="Meta+K" so assistive tech hears the shortcut.
   */
  shortcut?: string;
  /** Box classes; use inputClassName for the <input> itself. */
  className?: string;
  inputClassName?: string;
}

function setRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

/**
 * Search input in a grey capsule: search icon (never mirrored), a clear
 * button once there is text, Escape clears. Clearing goes through a native
 * input event, so controlled state, onChange and RHF register all see it.
 */
export function SearchField({
  value,
  defaultValue,
  onValueChange,
  onChange,
  onKeyDown,
  shortcut,
  className,
  inputClassName,
  ref,
  id,
  disabled,
  "aria-describedby": ariaDescribedBy,
  ...props
}: SearchFieldProps) {
  const t = useTranslations("Common");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uncontrolled, setUncontrolled] = useState(defaultValue ?? "");
  const current = value ?? uncontrolled;
  const control = useFieldControl({ id, disabled, "aria-describedby": ariaDescribedBy });

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (value === undefined) setUncontrolled(event.target.value);
    onChange?.(event);
    onValueChange?.(event.target.value);
  };

  const clear = () => {
    const input = inputRef.current;
    if (!input) return;
    // React tracks the value setter; going through the prototype setter and
    // an input event makes React fire onChange like a real edit.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, "");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    // Checked before defaultPrevented: an enclosing Dialog/Sheet prevents
    // this Escape in the capture phase precisely so the field can clear.
    if (event.key === "Escape" && current !== "") {
      // Only consume Escape when there is something to clear, so an
      // enclosing dialog still closes on Escape from an empty field.
      event.preventDefault();
      event.stopPropagation();
      clear();
    }
  };

  return (
    <div
      className={cn(
        "flex min-h-touch w-full items-center gap-2.5 rounded-pill bg-raised ps-4 pe-2 text-body text-fg",
        "has-[input:focus-visible]:focus-ring",
        control.disabled && "cursor-not-allowed opacity-45",
        className,
      )}
    >
      <Icon icon={Search} size={18} className="shrink-0 text-fg-secondary" />
      <input
        {...props}
        ref={(node) => {
          inputRef.current = node;
          setRef(ref, node);
        }}
        type="search"
        id={control.id}
        disabled={control.disabled}
        aria-describedby={control["aria-describedby"]}
        aria-invalid={control["aria-invalid"]}
        value={value}
        defaultValue={value === undefined ? defaultValue : undefined}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className={cn(
          "min-w-0 flex-1 self-stretch bg-transparent placeholder:text-fg-muted",
          "[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none",
          // The capsule shows the focus ring (moved, not removed).
          "outline-none focus-visible:outline-none focus-visible:shadow-none",
          inputClassName,
        )}
      />
      {current !== "" && !control.disabled ? (
        <button
          type="button"
          onClick={clear}
          aria-label={t("clear")}
          className={cn(
            "relative inline-flex size-9 shrink-0 items-center justify-center rounded-full text-fg-secondary",
            "transition-colors hover:bg-secondary-hover hover:text-fg",
            // 36px visual, 48px hit area (an invisible pseudo-element).
            "before:absolute before:-inset-1.5 before:rounded-full before:content-['']",
          )}
        >
          <Icon icon={X} size={16} />
        </button>
      ) : shortcut ? (
        <kbd
          aria-hidden="true"
          dir="ltr"
          className="me-1.5 shrink-0 rounded-pill bg-surface px-2 py-0.5 text-[0.6875rem] font-bold text-fg-secondary"
        >
          {shortcut}
        </kbd>
      ) : null}
    </div>
  );
}
