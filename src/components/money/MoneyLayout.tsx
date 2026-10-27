// Page pieces shared by the Money screens: the page column, a section with a title row, the
// sticky action bar above the bottom navigation, and the extended "Add expense" button.
import * as React from 'react';
import { ChevronUp, Plus } from 'lucide-react';
import { cn } from '../ui/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';

export function MoneyPage({ children, className, wide, lang }: { children: React.ReactNode; className?: string; wide?: boolean; lang?: string }) {
  return (
    <div lang={lang} className={cn('mx-auto flex w-full flex-col gap-6 px-4 pt-4 pb-6 md:px-6 lg:px-8 lg:pt-6', wide ? 'max-w-[1040px]' : 'max-w-[720px]', className)}>
      {children}
    </div>
  );
}

export function Section({ title, action, children, className, id }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string; id?: string }) {
  const autoId = React.useId();
  const headingId = id ?? `sec-${autoId.replace(/:/g, '')}`;
  return (
    <section aria-labelledby={title ? headingId : undefined} className={cn('flex flex-col gap-2.5', className)}>
      {(title || action) && (
        <div className="flex min-h-9 items-center justify-between gap-3">
          {title && <h2 id={headingId} className="text-subtitle font-semibold text-text">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** A read-only figure row inside a card: label (+ caption) on the left, the value on the right. */
export function FigureRow({ label, caption, value, emphasis, className }: { label: React.ReactNode; caption?: React.ReactNode; value: React.ReactNode; emphasis?: boolean; className?: string }) {
  return (
    <div className={cn('flex min-h-13 items-center gap-3 px-4 py-2', className)}>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-body-md font-medium text-text">{label}</span>
        {caption && <span className="text-label text-text-3">{caption}</span>}
      </span>
      <span className={cn('num shrink-0 text-right font-semibold text-text', emphasis ? 'text-title' : 'text-body-md')}>{value}</span>
    </div>
  );
}

/** A card holding FigureRows with dividers between them. */
export function FigureCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('overflow-hidden rounded-lg border border-border bg-surface [&>*+*]:border-t [&>*+*]:border-border', className)}>{children}</div>;
}

/** Action bar that stays at the bottom of the screen, above the bottom navigation on phones. */
export function StickyFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'sticky bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))] z-(--z-sticky) -mx-4 border-t border-border bg-surface px-4 py-3 md:bottom-0 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8',
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-[720px] items-center gap-2.5">{children}</div>
    </div>
  );
}

/**
 * Extended FAB (icon + label), bottom-right above the bottom navigation. `more` adds a chevron
 * (and long-press on the main button) that opens a short menu of other ways to do the same job.
 */
export function ExtendedFab({ label, onClick, disabled, disabledReason, more, moreLabel }: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  disabledReason?: string;
  more?: { label: string; icon?: React.ReactNode; onSelect: () => void }[];
  moreLabel?: string;
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const pressTimer = React.useRef<number | null>(null);
  const longPressed = React.useRef(false);
  const hasMore = !!more && more.length > 0 && !disabled;
  const startPress = () => {
    if (!hasMore) return;
    longPressed.current = false;
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      setMenuOpen(true);
    }, 500);
  };
  const endPress = () => {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };
  return (
    <div className="pointer-events-none fixed right-4 bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom)+16px)] z-(--z-fab) flex flex-col items-end gap-1 md:right-8 md:bottom-8">
      <div className="pointer-events-auto flex h-13 items-stretch overflow-hidden rounded-full bg-primary text-on-primary shadow-e2">
        <button
          type="button"
          onClick={() => {
            if (longPressed.current) { longPressed.current = false; return; }
            onClick();
          }}
          onPointerDown={startPress}
          onPointerUp={endPress}
          onPointerLeave={endPress}
          onContextMenu={(e) => { if (hasMore) e.preventDefault(); }}
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
          aria-disabled={disabled || undefined}
          className="flex min-w-11 items-center gap-2 pr-5 pl-4 text-body-md font-semibold outline-none transition-colors duration-(--dur-fast) hover:bg-primary-hover active:bg-primary-pressed focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-on-primary disabled:opacity-60"
        >
          <Plus className="size-5" aria-hidden="true" />
          {label}
        </button>
        {hasMore && (
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={moreLabel ?? 'More ways to add'}
                className="flex w-12 items-center justify-center border-l border-on-primary/30 outline-none transition-colors duration-(--dur-fast) hover:bg-primary-hover active:bg-primary-pressed focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-on-primary"
              >
                <ChevronUp className="size-5" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" className="z-(--z-overlay) min-w-48 rounded-lg border-border bg-surface p-1 shadow-e2">
              {more!.map((m) => (
                <DropdownMenuItem key={m.label} onSelect={m.onSelect} className="min-h-11 gap-3 rounded-md px-3 text-body-md text-text focus:bg-surface-2 focus:text-text">
                  {m.icon}
                  {m.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {disabled && disabledReason && (
        <p className="pointer-events-auto max-w-60 rounded-md border border-border bg-surface px-3 py-2 text-caption text-text-2 shadow-e2">{disabledReason}</p>
      )}
    </div>
  );
}

/** Space at the end of a list so the FAB never covers the last row. */
export function FabSpacer() {
  return <div aria-hidden="true" className="h-16 md:h-4" />;
}
