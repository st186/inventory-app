import * as React from "react";
import type { LucideIcon } from "lucide-react@0.487.0";
import { Inbox } from "lucide-react@0.487.0";

import { cn } from "./utils";

// What a list or chart shows when there's nothing in it: an icon in a soft circle, a title,
// one line of help and (usually) the action that fills it.
//
//   <EmptyState icon={Receipt} title="No expenses on 27 Oct" body="Anything bought today goes here."
//     action={<Button leadingIcon={<Plus />}>Add expense</Button>} />

export type EmptyStateProps = {
  icon?: LucideIcon;
  title: React.ReactNode;
  body?: React.ReactNode;
  /** One primary or secondary Button. */
  action?: React.ReactNode;
  /** Less padding, for inside a card or a list group. */
  compact?: boolean;
  className?: string;
};

function EmptyState({ icon: Icon = Inbox, title, body, action, compact = false, className }: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn("flex flex-col items-center text-center", compact ? "gap-2 px-4 py-6" : "gap-3 px-6 py-10", className)}
    >
      <span className={cn("flex items-center justify-center rounded-full bg-surface-2 text-text-2", compact ? "size-12" : "size-16")} aria-hidden="true">
        <Icon className={compact ? "size-6" : "size-8"} strokeWidth={1.75} />
      </span>
      <div className="flex max-w-sm flex-col gap-1">
        <p className="text-subtitle font-semibold text-text">{title}</p>
        {body && <p className="text-body-sm text-text-2">{body}</p>}
      </div>
      {action && <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export { EmptyState };
