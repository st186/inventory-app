"use client";

import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar@1.1.3";

import { cn } from "./utils";

// Avatar: a photo, or initials in ink on surface-3 (never a gradient). Sizes 32 / 40 / 56 / 64.
//
//   <InitialsAvatar name="Nabendu Bera" size={40} status="success" />

const sizeClasses = {
  32: "size-8 text-label",
  40: "size-10 text-body-sm",
  56: "size-14 text-title",
  64: "size-16 text-title-lg",
} as const;

export type AvatarSize = keyof typeof sizeClasses;

function Avatar({
  className,
  size = 40,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root> & { size?: AvatarSize }) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        "relative flex shrink-0 overflow-hidden rounded-full bg-surface-3 font-semibold text-text",
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
}

function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full object-cover", className)}
      {...props}
    />
  );
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center rounded-full bg-surface-3 text-text",
        className,
      )}
      {...props}
    />
  );
}

/** "Nabendu Bera" -> "NB", "subham" -> "SU". */
export function getInitials(name: string | null | undefined): string {
  const words = (name || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

const statusDot = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-text-disabled",
} as const;

function InitialsAvatar({
  name,
  src,
  size = 40,
  status,
  statusLabel,
  className,
}: {
  name: string;
  /** Photo URL; initials show while it loads or if it fails. */
  src?: string | null;
  size?: AvatarSize;
  /** Small presence dot (e.g. green = on shift). Pair it with words elsewhere in the row. */
  status?: keyof typeof statusDot;
  statusLabel?: string;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <Avatar size={size}>
        {src ? <AvatarImage src={src} alt="" /> : null}
        <AvatarFallback delayMs={src ? 400 : 0} aria-hidden="true">
          {getInitials(name)}
        </AvatarFallback>
      </Avatar>
      {status && (
        <span
          role={statusLabel ? "img" : undefined}
          aria-label={statusLabel}
          aria-hidden={statusLabel ? undefined : true}
          className={cn(
            "absolute -right-px -bottom-px size-3 rounded-full border-2 border-surface",
            statusDot[status],
          )}
        />
      )}
    </span>
  );
}

export { Avatar, AvatarImage, AvatarFallback, InitialsAvatar };
