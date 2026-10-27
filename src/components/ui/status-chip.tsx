import * as React from "react";
import type { LucideIcon } from "lucide-react@0.487.0";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  PackageCheck,
  Send,
  Truck,
  XCircle,
} from "lucide-react@0.487.0";

import { cn } from "./utils";
import { useT, type I18nKey, type I18nVars } from "../../utils/i18n";

// A status shown as a word (and optionally an icon or dot) on a soft tinted pill: 24 px tall,
// 12 px medium text. Colour never carries the meaning alone - the word does.
//
//   <StatusChip tone="success" icon={Check}>Paid</StatusChip>
//   <StatusChip tone="danger" icon={AlertTriangle}>Short ₹240</StatusChip>
//   <StatusChip tone="neutral">Draft</StatusChip>
//
// Fixed vocabularies (requests, pay, approvals) live in STATUS below so every screen uses the
// same word, tone and icon: <StatusChip status="request.packed" />.

export type StatusTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

export const statusToneClasses: Record<StatusTone, string> = {
  neutral: "border-border bg-surface-2 text-text-2",
  brand: "border-brand-saffron-border bg-brand-saffron-soft text-text",
  success: "border-success-border bg-success-soft text-success",
  warning: "border-warning-border bg-warning-soft text-warning",
  danger: "border-danger-border bg-danger-soft text-danger",
  info: "border-info-border bg-info-soft text-info",
};

const dotClasses: Record<StatusTone, string> = {
  neutral: "bg-text-3",
  brand: "bg-brand-saffron",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

type StatusDef = { tone: StatusTone; icon?: LucideIcon; label: I18nKey };

/** Shared status vocabulary: same word, colour and icon everywhere. */
export const STATUS = {
  // Stock requests
  "request.draft": { tone: "neutral", icon: FileText, label: "status.draft" },
  "request.notSent": { tone: "warning", label: "status.notSent" },
  "request.sent": { tone: "info", icon: Send, label: "status.sent" },
  "request.packed": { tone: "info", icon: PackageCheck, label: "status.packed" },
  "request.onTheWay": { tone: "info", icon: Truck, label: "status.onTheWay" },
  "request.received": { tone: "success", icon: Check, label: "status.received" },
  "request.late": { tone: "danger", icon: Clock, label: "status.late" },
  // Pay
  "pay.due": { tone: "warning", label: "status.due" },
  "pay.partlyPaid": { tone: "warning", label: "status.partlyPaid" },
  "pay.paid": { tone: "success", icon: Check, label: "status.paid" },
  // Approvals
  "approval.pending": { tone: "neutral", icon: Clock, label: "status.pending" },
  "approval.approved": { tone: "success", icon: CheckCircle2, label: "status.approved" },
  "approval.rejected": { tone: "danger", icon: XCircle, label: "status.rejected" },
  // Checklist
  "task.due": { tone: "warning", label: "status.due" },
  "task.late": { tone: "danger", icon: AlertTriangle, label: "status.late" },
  "task.done": { tone: "success", icon: Check, label: "status.done" },
  "task.later": { tone: "neutral", label: "status.later" },
  // Day close
  "dayClose.draft": { tone: "neutral", label: "status.draft" },
  "dayClose.waiting": { tone: "info", icon: Clock, label: "status.waitingToSend" },
  "dayClose.matched": { tone: "success", icon: Check, label: "status.matched" },
} satisfies Record<string, StatusDef>;

export type StatusKey = keyof typeof STATUS;

export type StatusChipProps = Omit<React.ComponentProps<"span">, "children"> & {
  /** A word from the shared vocabulary; sets tone, icon and the translated label. */
  status?: StatusKey;
  /** Values for the status label, e.g. { amount: '₹240' }. */
  vars?: I18nVars;
  tone?: StatusTone;
  /** A lucide icon component shown before the word. */
  icon?: LucideIcon;
  /** A small dot instead of an icon. */
  dot?: boolean;
  size?: "md" | "sm";
  children?: React.ReactNode;
};

function StatusChip({ status, vars, tone: toneProp, icon: iconProp, dot, size = "md", className, children, ...props }: StatusChipProps) {
  const { t } = useT();
  const def: StatusDef | undefined = status ? STATUS[status] : undefined;
  const tone = toneProp ?? def?.tone ?? "neutral";
  const Icon = iconProp ?? def?.icon;
  const label = children ?? (def ? t(def.label, vars) : null);
  return (
    <span
      data-slot="status-chip"
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1 rounded-full border font-medium whitespace-nowrap",
        size === "md" ? "h-6 px-2.5 text-caption" : "h-[22px] px-2 text-caption",
        statusToneClasses[tone],
        className,
      )}
      {...props}
    >
      {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden="true" /> : dot ? <span className={cn("size-1.5 rounded-full", dotClasses[tone])} aria-hidden="true" /> : null}
      {label}
    </span>
  );
}

export { StatusChip };
