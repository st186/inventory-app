// Small pieces every Team screen shares: the page column, the phone FAB and sticky footer, the
// sub-page hook (a pushed page that Android Back closes), date labels and error text.
import * as React from 'react';
import { useShell, type ShellContextValue } from '../shell/ShellContext';
import { cn } from '../ui/utils';
import { translate, useT, type I18nKey, type Lang } from '../../utils/i18n';

/** The app shell when the screen runs inside it; null in the dev preview pages and tests. */
export function useOptionalShell(): ShellContextValue | null {
  try {
    return useShell();
  } catch {
    return null;
  }
}

/**
 * A page pushed on top of a Team screen (a person's detail page, My pay): kept in the route's
 * params when the shell is there, so Android Back and the browser's back button close it, and in
 * local state otherwise.
 */
export function useSubPage(key: string): [string | null, (value: string) => void, () => void] {
  const shell = useOptionalShell();
  const [local, setLocal] = React.useState<string | null>(null);
  if (shell) {
    const { route } = shell.router;
    const value = route.params[key] ?? null;
    return [
      value,
      (next: string) => shell.router.push(route.path, { ...route.params, [key]: next }),
      () => {
        if (shell.router.depth > 0) shell.router.back();
        else {
          const { [key]: _drop, ...rest } = route.params;
          shell.router.replace(route.path, rest);
        }
      },
    ];
  }
  return [local, setLocal, () => setLocal(null)];
}

/** The shell's sticky header height, so a search bar can stick just under it. */
export function useHeaderOffset(): number {
  const [offset, setOffset] = React.useState(0);
  React.useEffect(() => {
    const header = document.querySelector<HTMLElement>('header[data-slot="page-header"]');
    if (!header || typeof ResizeObserver === 'undefined') return;
    const update = () => setOffset(header.getBoundingClientRect().height);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(header);
    return () => ro.disconnect();
  }, []);
  return offset;
}

/** The column every Team screen sits in. */
export function TeamPage({ className, children, wide = false, ...rest }: React.ComponentProps<'div'> & { wide?: boolean }) {
  return (
    <div className={cn('mx-auto flex w-full flex-col gap-4 px-4 py-4 lg:px-8 lg:py-6', wide ? 'max-w-[1120px]' : 'max-w-[960px]', className)} {...rest}>
      {children}
    </div>
  );
}

/** Extended floating action button on phones (hidden from 768 px, where the action sits in the page). */
export function Fab({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'fixed right-4 bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom)+16px)] z-(--z-fab) md:hidden',
        'inline-flex h-13 min-h-13 items-center gap-2 rounded-full bg-primary pr-5 pl-4 text-body-md font-semibold text-on-primary shadow-e2',
        'outline-none transition-colors duration-(--dur-fast) hover:bg-primary-hover active:bg-primary-pressed focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        '[&_svg]:size-5',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/** Action bar that sticks above the bottom nav on phones and to the bottom of the page on wider screens. */
export function StickyFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'sticky bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))] z-(--z-sticky) -mx-4 flex gap-2.5 border-t border-border bg-surface px-4 py-3 md:bottom-0 lg:-mx-8 lg:px-8',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Heading row for a block of a page (16 px semibold) with an optional action on the right. */
export function SectionHeader({ title, meta, action, id }: { title: React.ReactNode; meta?: React.ReactNode; action?: React.ReactNode; id?: string }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <div className="flex min-w-0 items-baseline gap-2">
        <h2 id={id} className="text-subtitle font-semibold text-text">{title}</h2>
        {meta && <span className="text-label text-text-3">{meta}</span>}
      </div>
      {action}
    </div>
  );
}

/** Label / value pairs in a card (read-only details). */
export function DetailList({ rows }: { rows: { label: React.ReactNode; value: React.ReactNode; hidden?: boolean }[] }) {
  const shown = rows.filter((r) => !r.hidden);
  return (
    <dl className="overflow-hidden rounded-lg border border-border bg-surface [&>*+*]:border-t [&>*+*]:border-border">
      {shown.map((r, i) => (
        <div key={i} className="flex min-h-13 items-center justify-between gap-4 px-4 py-2.5">
          <dt className="text-body-sm text-text-2">{r.label}</dt>
          <dd className="min-w-0 text-right text-body-sm font-medium break-words text-text">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---- Dates -----------------------------------------------------------------------------------

const parseDay = (iso: string) => {
  const [y, m, d] = (iso || '').slice(0, 10).split('-').map(Number);
  return { y, m, d };
};

/** "27 Oct 2026" (or "27 Oct" with short) in the person's language; '' for no date. */
export function formatDay(iso: string | null | undefined, lang: Lang, opts: { short?: boolean; weekday?: boolean } = {}): string {
  if (!iso) return '';
  const { y, m, d } = parseDay(iso);
  if (!y || !m || !d) return iso;
  const month = translate(lang, `date.ms.${m - 1}` as I18nKey);
  const wd = opts.weekday ? `${translate(lang, `date.wd.${new Date(Date.UTC(y, m - 1, d)).getUTCDay()}` as I18nKey)} ` : '';
  return opts.short ? `${wd}${d} ${month}` : `${wd}${d} ${month} ${y}`;
}

/** "October 2026" for a YYYY-MM key. */
export function formatMonth(key: string, lang: Lang): string {
  const [y, m] = (key || '').split('-').map(Number);
  if (!y || !m) return key;
  return `${translate(lang, `date.m.${m - 1}` as I18nKey)} ${y}`;
}

/** A timestamp's date in IST, as YYYY-MM-DD. */
export function istDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso.slice(0, 10);
  return new Date(t + 330 * 60000).toISOString().slice(0, 10);
}

export function useFormatters() {
  const { lang } = useT();
  return React.useMemo(
    () => ({
      day: (iso: string | null | undefined, opts?: { short?: boolean; weekday?: boolean }) => formatDay(iso, lang, opts),
      month: (key: string) => formatMonth(key, lang),
    }),
    [lang],
  );
}

/** The message of an error, or a fallback. */
export function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** "9876543210" -> tel / WhatsApp targets (Indian numbers get +91). */
export function phoneLinks(phone: string | null | undefined): { tel: string; whatsapp: string } | null {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  const local = digits.slice(-10);
  const full = digits.length > 10 ? digits : `91${local}`;
  return { tel: `tel:+${full}`, whatsapp: `https://wa.me/${full}` };
}
