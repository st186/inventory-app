"use client";

import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from "lucide-react@0.487.0";
import { Toaster as Sonner, type ToasterProps } from "sonner@2.0.3";

// Toasts: bottom-centre just above the bottom nav (--toast-bottom), 4 seconds, an icon per
// kind, optional action ("Undo", "Retry"). Replaces alert(). Errors that need a decision use
// confirm() instead.
//
//   import { toast } from "@/components/ui/sonner";
//   toast.success("Expense saved", { action: { label: "Undo", onClick: undo } });
//   toast.error("Couldn't save. Check the internet and try again.");
//
// The placement is part of the design, so `position` / `richColors` passed by older code are
// ignored.

const Toaster = ({ position: _position, richColors: _richColors, ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      position="bottom-center"
      duration={4000}
      gap={8}
      visibleToasts={3}
      offset={{ bottom: "var(--toast-bottom)" }}
      mobileOffset={{ bottom: "var(--toast-bottom)", left: "16px", right: "16px" }}
      className="toaster"
      style={{ zIndex: "var(--z-toast)" } as React.CSSProperties}
      icons={{
        success: <CheckCircle2 className="size-5 text-success" aria-hidden="true" />,
        error: <XCircle className="size-5 text-danger" aria-hidden="true" />,
        warning: <AlertTriangle className="size-5 text-warning" aria-hidden="true" />,
        info: <Info className="size-5 text-info" aria-hidden="true" />,
        loading: <Loader2 className="size-5 animate-spin text-text-2" aria-hidden="true" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-full items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-text shadow-e2 sm:w-[360px]",
          title: "text-body-sm font-medium text-text",
          description: "text-label text-text-2",
          icon: "flex shrink-0 items-center",
          content: "flex min-w-0 flex-1 flex-col gap-0.5",
          actionButton:
            "ml-auto inline-flex h-11 min-h-11 shrink-0 items-center rounded-md px-3 text-body-sm font-semibold text-primary hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          cancelButton:
            "inline-flex h-11 min-h-11 shrink-0 items-center rounded-md px-3 text-body-sm font-medium text-text-2 hover:bg-surface-2",
          closeButton: "hidden",
          error: "border-danger-border",
          success: "",
          warning: "border-warning-border",
          info: "",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
export { toast } from "sonner@2.0.3";
