import * as React from "react";
import { Slot } from "@radix-ui/react-slot@1.1.2";
import { cva, type VariantProps } from "class-variance-authority@0.7.1";
import { Loader2 } from "lucide-react@0.487.0";

import { cn } from "./utils";

// Warm ledger buttons. At most one `primary` per view; everything else is secondary/ghost.
// Sizes: sm 36 px (13 px text, with a 44 px touch area), md 44 px (15 px semibold), lg 52 px
// (16 px semibold - the sticky-footer CTA, full width on phones).
// Older names still work: default = primary, destructive = danger, outline = secondary,
// size "default" = md.
const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold",
    "transition-[background-color,border-color,color,transform] duration-(--dur-fast) ease-standard active:scale-[0.98]",
    "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  ].join(" "),
  {
    variants: {
      variant: {
        primary: "bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-pressed",
        secondary: "border border-border-strong bg-surface text-text hover:bg-surface-2 active:bg-surface-3",
        ghost: "bg-transparent text-text-2 hover:bg-surface-2 hover:text-text active:bg-surface-3",
        danger: "bg-danger text-on-danger hover:bg-danger-hover active:bg-danger-hover",
        "danger-ghost": "border border-danger-border bg-surface text-danger hover:bg-danger-soft active:bg-danger-soft",
        link: "h-auto min-h-0 rounded-sm px-0 text-primary underline-offset-4 hover:text-primary-hover hover:underline active:scale-100",
        // legacy aliases
        default: "bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-pressed",
        destructive: "bg-danger text-on-danger hover:bg-danger-hover active:bg-danger-hover",
        outline: "border border-border-strong bg-surface text-text hover:bg-surface-2 active:bg-surface-3",
      },
      size: {
        sm: "hit-44 h-9 min-h-9 gap-1.5 rounded-sm px-3 text-label [&_svg:not([class*='size-'])]:size-4",
        md: "h-11 min-h-11 px-4 text-body-md",
        lg: "h-13 min-h-13 px-5 text-body",
        icon: "size-11 min-h-11 min-w-11 rounded-full p-0",
        // legacy alias
        default: "h-11 min-h-11 px-4 text-body-md",
      },
      fullWidth: {
        true: "w-full",
        false: "",
      },
    },
    compoundVariants: [
      { variant: "link", size: ["sm", "md", "lg", "default"], className: "h-auto min-h-0 px-0" },
    ],
    defaultVariants: {
      variant: "primary",
      size: "md",
      fullWidth: false,
    },
  },
);

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>["size"]>;

export type ButtonProps = React.ComponentPropsWithoutRef<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Render the child element (e.g. an <a>) with button styles. */
    asChild?: boolean;
    /** Shows a spinner in place of the leading icon, keeps the label, disables the button. */
    loading?: boolean;
    /** Icon before the label (a lucide element). */
    leadingIcon?: React.ReactNode;
    /** Icon after the label. */
    trailingIcon?: React.ReactNode;
  };

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  className,
  variant,
  size,
  fullWidth,
  asChild = false,
  loading = false,
  leadingIcon,
  trailingIcon,
  disabled,
  children,
  type,
  ...props
}, ref) {
  const classes = cn(buttonVariants({ variant, size, fullWidth }), className);

  if (asChild) {
    return (
      <Slot ref={ref} data-slot="button" className={classes} aria-busy={loading || undefined} {...props}>
        {children}
      </Slot>
    );
  }

  return (
    <button
      ref={ref}
      data-slot="button"
      type={type ?? "button"}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : leadingIcon}
      {children}
      {trailingIcon}
    </button>
  );
});

export { Button, buttonVariants };
