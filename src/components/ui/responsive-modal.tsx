"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog@1.1.6";
import { Drawer as DrawerPrimitive } from "vaul@1.1.2";
import { ArrowLeft, X } from "lucide-react@0.487.0";

import { cn } from "./utils";
import { Button } from "./button";
import { IconButton } from "./icon-button";
import { DrawerHandle } from "./drawer";
import { useIsDesktop } from "./use-media-query";
import { useT } from "../../utils/i18n";

// One modal for every form and detail view:
//   phones (< 768 px)  bottom sheet - drag handle, swipe down to close, sticky footer
//   tablet / desktop   centred dialog - 480 px for forms, 720 px for detail
//
//   <ResponsiveModal open={open} onOpenChange={setOpen} title="Add expense" dirty={changed}
//     footer={<>
//       <Button variant="secondary" size="lg">Save + another</Button>
//       <Button size="lg" className="flex-1" loading={saving} onClick={save}>Save expense</Button>
//     </>}>
//     ...fields...
//   </ResponsiveModal>
//
// `dirty`: closing (scrim tap, Esc, X, swipe) first asks "Discard your changes?" in the footer.
// Never open a sheet from a sheet: swap the content instead and pass `onBack` - the header
// then shows a back arrow (e.g. payslip -> "Add payout" -> back).

export type ResponsiveModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  /** Sticky action bar (primary + optional secondary). */
  footer?: React.ReactNode;
  /** Desktop width: "form" 480 px, "detail" 720 px. */
  size?: "form" | "detail";
  /** Unsaved input: closing asks before throwing it away. */
  dirty?: boolean;
  discardText?: { title?: string; body?: string; keep?: string; discard?: string };
  /** Shows a back arrow that swaps the content back (no sheet-on-sheet). */
  onBack?: () => void;
  /** Icon buttons before the close button (e.g. an overflow menu). */
  headerActions?: React.ReactNode;
  hideClose?: boolean;
  /** Class for the scrolling body. */
  bodyClassName?: string;
  /** Force one presentation (default: by screen width). */
  variant?: "auto" | "sheet" | "dialog";
  /** Runs once the close animation has finished - reset form state here. */
  onClosed?: () => void;
};

let openModals = 0;

function useSheetOnSheetWarning(open: boolean) {
  React.useEffect(() => {
    if (!open) return;
    openModals += 1;
    if (openModals > 1 && import.meta.env.DEV) {
      console.warn("[ResponsiveModal] A modal opened on top of another one. Swap the content and use onBack instead.");
    }
    return () => {
      openModals -= 1;
    };
  }, [open]);
}

function ResponsiveModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "form",
  dirty = false,
  discardText,
  onBack,
  headerActions,
  hideClose = false,
  bodyClassName,
  variant = "auto",
  onClosed,
}: ResponsiveModalProps) {
  const { t } = useT();
  const isDesktop = useIsDesktop();
  const asDialog = variant === "dialog" || (variant === "auto" && isDesktop);
  const [confirming, setConfirming] = React.useState(false);
  const keepRef = React.useRef<HTMLButtonElement>(null);
  useSheetOnSheetWarning(open);

  React.useEffect(() => {
    if (!open) setConfirming(false);
  }, [open]);

  React.useEffect(() => {
    if (confirming) keepRef.current?.focus();
  }, [confirming]);

  const requestClose = React.useCallback(() => {
    if (dirty) setConfirming(true);
    else onOpenChange(false);
  }, [dirty, onOpenChange]);

  const guardOutside = (event: Event) => {
    if (dirty) {
      event.preventDefault();
      setConfirming(true);
    }
  };
  const guardEscape = (event: KeyboardEvent) => {
    if (confirming) {
      event.preventDefault();
      setConfirming(false);
    } else if (dirty) {
      event.preventDefault();
      setConfirming(true);
    }
  };

  const TitleComp = asDialog ? DialogPrimitive.Title : DrawerPrimitive.Title;
  const DescriptionComp = asDialog ? DialogPrimitive.Description : DrawerPrimitive.Description;

  const header = (
    <div className={cn("flex min-h-13 shrink-0 items-center gap-1", asDialog ? "px-4 pt-3 pb-1" : "py-1 pr-2 pl-4", onBack && "pl-1")}>
      {onBack && <IconButton label={t("common.back")} icon={<ArrowLeft />} onClick={onBack} />}
      <div className={cn("flex min-w-0 flex-1 flex-col", asDialog && !onBack && "pl-2")}>
        <TitleComp className="text-title font-semibold text-text">{title}</TitleComp>
        {description ? (
          <DescriptionComp className="text-body-sm text-text-2">{description}</DescriptionComp>
        ) : (
          <DescriptionComp className="sr-only">{typeof title === "string" ? title : ""}</DescriptionComp>
        )}
      </div>
      {headerActions}
      {!hideClose && <IconButton label={t("common.close")} icon={<X />} onClick={requestClose} />}
    </div>
  );

  const body = (
    <div
      data-slot="modal-body"
      className={cn(
        "min-h-0 flex-1 overflow-y-auto overscroll-contain",
        asDialog ? "px-6 pt-2 pb-6" : "px-4 pt-1 pb-4",
        bodyClassName,
      )}
    >
      {children}
    </div>
  );

  const footerBar = confirming ? (
    <div
      data-slot="modal-footer"
      className={cn(
        "flex shrink-0 flex-col gap-3 border-t border-border bg-surface",
        asDialog ? "px-6 py-4" : "px-4 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]",
      )}
    >
      <div role="alert" className="flex flex-col">
        <span className="text-body-md font-semibold text-text">{discardText?.title ?? t("common.discardTitle")}</span>
        <span className="text-label text-text-2">{discardText?.body ?? t("common.discardBody")}</span>
      </div>
      <div className={cn("flex gap-2.5", asDialog && "justify-end")}>
        <Button ref={keepRef} variant="secondary" size={asDialog ? "md" : "lg"} className={cn(!asDialog && "flex-1")} onClick={() => setConfirming(false)}>
          {discardText?.keep ?? t("common.keepEditing")}
        </Button>
        <Button
          variant="danger"
          size={asDialog ? "md" : "lg"}
          className={cn(!asDialog && "flex-1")}
          onClick={() => {
            setConfirming(false);
            onOpenChange(false);
          }}
        >
          {discardText?.discard ?? t("common.discard")}
        </Button>
      </div>
    </div>
  ) : footer ? (
    <div
      data-slot="modal-footer"
      className={cn(
        "flex shrink-0 gap-2.5 border-t border-border bg-surface",
        asDialog ? "justify-end px-6 py-4 [&>*]:flex-none" : "px-4 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]",
      )}
    >
      {footer}
    </div>
  ) : null;

  if (asDialog) {
    return (
      <DialogPrimitive.Root open={open} onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-(--z-sheet) bg-scrim data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            data-slot="responsive-modal"
            onPointerDownOutside={guardOutside}
            onEscapeKeyDown={guardEscape}
            onCloseAutoFocus={() => onClosed?.()}
            className={cn(
              "fixed top-1/2 left-1/2 z-(--z-sheet) flex max-h-[85dvh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border bg-bg text-text shadow-e3 outline-none",
              "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-98 data-[state=open]:zoom-in-98",
              size === "form" ? "max-w-[480px]" : "max-w-[720px]",
            )}
          >
            {header}
            {body}
            {footerBar}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    );
  }

  return (
    <DrawerPrimitive.Root
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}
      dismissible={!dirty}
      repositionInputs={false}
      onAnimationEnd={(isOpen) => {
        if (!isOpen) onClosed?.();
      }}
    >
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="fixed inset-0 z-(--z-sheet) bg-scrim" />
        <DrawerPrimitive.Content
          data-slot="responsive-modal"
          onPointerDownOutside={guardOutside}
          onEscapeKeyDown={guardEscape}
          className="fixed inset-x-0 bottom-0 z-(--z-sheet) flex max-h-[92dvh] flex-col rounded-t-xl bg-bg text-text shadow-sheet outline-none"
        >
          <DrawerHandle />
          {header}
          {body}
          {footerBar}
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}

export { ResponsiveModal };
