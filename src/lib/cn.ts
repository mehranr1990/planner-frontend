import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/*
 * tailwind-merge has to know the custom theme keys, otherwise `text-body`
 * reads as a colour and silently drops `text-fg` (and vice versa).
 */
const twMerge = extendTailwindMerge<"type-scale">({
  extend: {
    theme: {
      text: ["body"],
      radius: ["card", "card-sm", "tile", "row", "input", "pill"],
      shadow: ["island", "elevated"],
      spacing: ["gutter", "card", "card-lg", "section", "touch", "page"],
      ease: ["standard", "emphasized"],
    },
    classGroups: {
      "type-scale": [
        { type: ["display", "h1", "title", "body", "caption", "label"] },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
