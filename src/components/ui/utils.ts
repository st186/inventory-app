import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge has to know the design system's own size/shadow names. Without this it reads
// `text-body` as a colour, and `cn("text-body text-text")` would silently drop the font size.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["display", "title-lg", "title", "subtitle", "body", "body-md", "body-sm", "label", "caption", "overline"],
      shadow: ["e1", "e2", "e3", "sheet"],
      ease: ["standard", "exit"],
    },
    classGroups: {
      "fvn-spacing": ["num"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
