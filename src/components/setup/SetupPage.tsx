// Shared layout pieces for the More / Setup / Data / Assets screens: the page column (the shell's
// top bar already carries the title and back arrow), a loading list that only appears after
// 300 ms, and a labelled read-only figure row.
import type { ReactNode } from 'react';
import { cn } from '../ui/utils';
import { Delayed, SkeletonListRows, SkeletonStatTile } from '../ui/skeleton';

export function SetupPage({ children, wide = false, className }: { children: ReactNode; wide?: boolean; className?: string }) {
  return (
    <div className={cn('mx-auto flex w-full min-w-0 flex-col gap-5 px-4 py-4 lg:px-8 lg:py-6', wide ? 'max-w-[1080px]' : 'max-w-[720px]', className)}>
      {children}
    </div>
  );
}

/** The skeleton shown while a list loads (never "0" or an empty state while loading). */
export function LoadingList({ rows = 5, leading = 'icon', withTile = false }: { rows?: number; leading?: 'icon' | 'avatar' | 'none'; withTile?: boolean }) {
  return (
    <Delayed>
      <div className="flex flex-col gap-5">
        {withTile && <SkeletonStatTile hero />}
        <SkeletonListRows count={rows} leading={leading} />
      </div>
    </Delayed>
  );
}

/** "Label ........ value" inside a card (read-only details in a sheet). */
export function DetailRow({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-h-11 items-center justify-between gap-3 py-2', className)}>
      <span className="text-body-sm text-text-2">{label}</span>
      <span className="min-w-0 text-right text-body-md font-medium text-text">{children}</span>
    </div>
  );
}

/** A plain card for sheet sections (surface, border, radius lg). */
export function SheetCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-lg border border-border bg-surface px-4 py-1 [&>*+*]:border-t [&>*+*]:border-border', className)}>{children}</div>;
}
