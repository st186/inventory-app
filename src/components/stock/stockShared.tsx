// Small pieces the Stock & Production screens share: momo names and bag counts in the person's
// language, request stages and status chips, a collapsible list group, a stepper that also takes
// decimals, and the sticky action bar that sits above the bottom navigation.
import * as React from 'react';
import { ChevronDown, Minus, Plus } from 'lucide-react';
import { cn } from '../ui/utils';
import { StatusChip, type StatusTone } from '../ui/status-chip';
import { bagSize } from '../../utils/batches';
import { translate, useT, type I18nKey, type Lang } from '../../utils/i18n';
import type { ProductionRequest } from '../../utils/api';
import { shortDateLabel, weekdayShort } from '../ui/date-utils';
import { getTodayIST } from '../../utils/timezone';

// ---------------------------------------------------------------------------------------------
// Momo names and bags

const MOMO_NAME_KEYS: Record<string, I18nKey> = {
  chicken: 'stock.momo.chicken',
  chickenCheese: 'stock.momo.chickenCheese',
  veg: 'stock.momo.veg',
  cheeseCorn: 'stock.momo.cheeseCorn',
  paneer: 'stock.momo.paneer',
  vegKurkure: 'stock.momo.vegKurkure',
  chickenKurkure: 'stock.momo.chickenKurkure',
  schezwan: 'stock.momo.schezwan',
};

/** A momo type's short name ("Chicken cheese") in the person's language; unknown types keep their own label. */
export function momoName(lang: Lang, key: string, fallback?: string): string {
  const k = MOMO_NAME_KEYS[key];
  if (k) return translate(lang, k);
  return (fallback || key).replace(/ Momos?$/, '');
}

/** "3 bags", "1 bag + 5 loose", "5 loose" - utils/batches bagsLabel, in the person's language. */
export function bagsText(lang: Lang, pieces: number, key: string): string {
  if (!pieces || pieces <= 0) return translate(lang, 'stock.bags', { n: 0 });
  const size = bagSize(key);
  const bags = Math.floor(pieces / size);
  const loose = pieces - bags * size;
  const bagText = translate(lang, bags === 1 ? 'stock.bag' : 'stock.bags', { n: bags });
  if (loose === 0) return bagText;
  return bags === 0 ? translate(lang, 'stock.loose', { n: loose }) : `${bagText} + ${translate(lang, 'stock.loose', { n: loose })}`;
}

/** A data label (waste reason, damage reason, stock-out reason) in the person's language when there is a translation. */
export function reasonLabel(lang: Lang, kind: 'waste' | 'dmg' | 'soReason' | 'soReasonHint', id: string, fallback: string): string {
  const key = (kind === 'soReasonHint' ? `stock.soReason.${id}.hint` : `stock.${kind}.${id}`) as I18nKey;
  const text = translate(lang, key);
  return text === key ? fallback : text;
}

export const formatCount = (n: number) => Math.round(n).toLocaleString('en-IN');

/** "Sat 28 Oct" for an ISO day. */
export function dayLabel(lang: Lang, iso: string): string {
  const day = iso.slice(0, 10);
  return `${weekdayShort(day, lang)} ${shortDateLabel(day, lang)}`;
}

/** "8:42 am" in IST for a stored time (UTC ISO strings and the old "31/12/2025, 00:29:07" alike). */
export function timeLabel(stamp?: string | null): string {
  if (!stamp) return '';
  if (stamp.includes('/')) {
    const time = stamp.split(',')[1]?.trim() || '';
    const [h, m] = time.split(':').map(Number);
    if (Number.isNaN(h)) return '';
    const hh = h % 12 === 0 ? 12 : h % 12;
    return `${hh}:${String(m || 0).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
  }
  const d = new Date(stamp);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).toLowerCase();
}

/** "Sat 28 Oct, 8:42 am", or just the time when it's today. */
export function whenLabel(lang: Lang, stamp?: string | null): string {
  if (!stamp) return '';
  const d = new Date(stamp);
  if (stamp.includes('/') || Number.isNaN(d.getTime())) return timeLabel(stamp);
  const day = new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  const time = timeLabel(stamp);
  return day === getTodayIST() ? time : `${dayLabel(lang, day)}, ${time}`;
}

// ---------------------------------------------------------------------------------------------
// Request stages: Sent -> Packed -> On the way -> Received

export type RequestStatus = ProductionRequest['status'];

/** 0 sent (new / accepted / packing), 1 packed, 2 on the way, 3 received. */
export function requestStage(status: RequestStatus | string): 0 | 1 | 2 | 3 {
  if (status === 'prepared') return 1;
  if (status === 'shipped' || status === 'partially-shipped') return 2;
  if (status === 'delivered' || status === 'partially-delivered') return 3;
  return 0;
}

/** The production queue's three buckets. */
export type QueueBucket = 'toPack' | 'packed' | 'sent';
export function queueBucket(status: RequestStatus | string): QueueBucket {
  const stage = requestStage(status);
  return stage === 0 ? 'toPack' : stage === 1 ? 'packed' : 'sent';
}

const STATUS_WORD: Record<string, { key: I18nKey; tone: StatusTone }> = {
  pending: { key: 'stock.status.new', tone: 'warning' },
  accepted: { key: 'stock.status.accepted', tone: 'info' },
  'in-preparation': { key: 'stock.status.packing', tone: 'info' },
  prepared: { key: 'status.packed', tone: 'info' },
  shipped: { key: 'status.onTheWay', tone: 'info' },
  'partially-shipped': { key: 'stock.status.onTheWayPart', tone: 'warning' },
  delivered: { key: 'status.received', tone: 'success' },
  'partially-delivered': { key: 'stock.status.receivedPart', tone: 'warning' },
};

/** A request's status as a chip (word + tone; part shipments say so). */
export function RequestStatusChip({ status, size }: { status: RequestStatus | string; size?: 'md' | 'sm' }) {
  const { t } = useT();
  const def = STATUS_WORD[status] || STATUS_WORD.pending;
  return <StatusChip tone={def.tone} size={size}>{t(def.key)}</StatusChip>;
}

export function requestStatusWord(lang: Lang, status: RequestStatus | string): string {
  return translate(lang, (STATUS_WORD[status] || STATUS_WORD.pending).key);
}

/** Momo pieces asked for on a request (new short keys, old long keys as fallback). */
export function requestedQty(req: any, camelKey: string): number {
  return (req?.[camelKey] ?? req?.[camelKey + 's']) || 0;
}

export function requestTotalPieces(req: any, keys: string[]): number {
  return keys.reduce((sum, k) => sum + requestedQty(req, k), 0);
}

// ---------------------------------------------------------------------------------------------
// Layout pieces

/** The page column for the stock screens: 16 px gutter on phones, wider on desktop. */
export function StockPage({ children, wide = false, className, lang }: { children: React.ReactNode; wide?: boolean; className?: string; lang?: string }) {
  return (
    <div lang={lang} className={cn('mx-auto flex w-full flex-col gap-6 px-4 py-4 lg:px-8 lg:py-6', wide ? 'max-w-6xl' : 'max-w-[720px]', className)}>
      {children}
    </div>
  );
}

/** A section heading row (16 px semibold) with optional meta text and an action on the right. */
export function SectionTitle({ title, meta, action, id }: { title: React.ReactNode; meta?: React.ReactNode; action?: React.ReactNode; id?: string }) {
  return (
    <div className="mb-2.5 flex min-h-6 items-center justify-between gap-3">
      <div className="flex min-w-0 items-baseline gap-2">
        <h2 id={id} className="text-subtitle font-semibold text-text">{title}</h2>
        {meta && <span className="text-label text-text-3">{meta}</span>}
      </div>
      {action}
    </div>
  );
}

/** Actions pinned above the bottom navigation on phones (in the flow from 768 px). */
export function StickyActions({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'sticky bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))] z-(--z-sticky) -mx-4 flex gap-2.5 border-t border-border bg-surface px-4 py-3 md:bottom-0 md:mx-0 md:rounded-lg md:border',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A card whose header row opens and closes its body (Sauces, Kitchen supplies, Shared pool...). */
export function CollapsibleCard({
  title,
  subtitle,
  chip,
  defaultOpen = false,
  open: openProp,
  onOpenChange,
  icon,
  children,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  chip?: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const [inner, setInner] = React.useState(defaultOpen);
  const open = openProp ?? inner;
  const id = React.useId();
  const toggle = () => {
    setInner(!open);
    onOpenChange?.(!open);
  };
  return (
    <section className={cn('overflow-hidden rounded-lg border border-border bg-surface', className)}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={id}
        className="flex min-h-15 w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors duration-(--dur-fast) hover:bg-surface-2/60 active:bg-surface-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {icon}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-body-md font-medium text-text">{title}</span>
          {subtitle && <span className="line-clamp-2 text-label text-text-3">{subtitle}</span>}
        </span>
        {chip}
        <ChevronDown className={cn('size-5 shrink-0 text-text-3 transition-transform duration-(--dur)', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && (
        <div id={id} className="border-t border-border">
          {children}
        </div>
      )}
    </section>
  );
}

/**
 * − [value] + like ui/NumberStepper, for quantities that may have decimals (a kitchen item
 * in litres) or need their own step rule. The middle can be typed into.
 */
export function QuantityStepper({
  value,
  onChange,
  label,
  step = 1,
  decimals = false,
  min = 0,
  emptyWhenZero = false,
  bump,
  disabled,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  step?: number;
  decimals?: boolean;
  min?: number;
  emptyWhenZero?: boolean;
  /** Own rule for − and + (e.g. to the next whole bag); default value ± step. */
  bump?: (value: number, direction: 1 | -1) => number;
  disabled?: boolean;
  className?: string;
}) {
  const { t } = useT();
  const [draft, setDraft] = React.useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = decimals ? parseFloat(draft) : parseInt(draft, 10);
    onChange(Number.isFinite(n) ? Math.max(min, n) : min);
    setDraft(null);
  };
  const shown = draft ?? (emptyWhenZero && !value ? '' : String(value));
  const btn = cn(
    'flex size-11 min-h-11 shrink-0 items-center justify-center bg-surface text-text outline-none transition-colors duration-(--dur-fast)',
    'hover:bg-surface-2 active:bg-surface-3 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
    'disabled:cursor-not-allowed disabled:text-text-disabled disabled:hover:bg-surface [&_svg]:size-5',
  );
  return (
    <div role="group" aria-label={label} className={cn('inline-flex shrink-0 items-stretch overflow-hidden rounded-md border border-border-strong bg-surface', disabled && 'opacity-60', className)}>
      <button type="button" className={btn} aria-label={t('common.less', { label })} disabled={disabled || value <= min} onClick={() => onChange(Math.max(min, bump ? bump(value, -1) : value - step))}>
        <Minus aria-hidden="true" />
      </button>
      <div className="flex w-14 items-center justify-center border-x border-border">
        <input
          type="text"
          inputMode={decimals ? 'decimal' : 'numeric'}
          aria-label={label}
          disabled={disabled}
          value={shown}
          placeholder="0"
          onFocus={(e) => {
            setDraft(emptyWhenZero && !value ? '' : String(value));
            e.currentTarget.select();
          }}
          onChange={(e) => setDraft(e.target.value.replace(decimals ? /[^\d.]/g : /[^\d]/g, ''))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commit();
              e.currentTarget.blur();
            }
          }}
          className="num h-11 w-full bg-transparent text-center text-body font-semibold text-text outline-none placeholder:text-text-3 focus:bg-primary-soft"
        />
      </div>
      <button type="button" className={btn} aria-label={t('common.more', { label })} disabled={disabled} onClick={() => onChange(bump ? bump(value, 1) : value + step)}>
        <Plus aria-hidden="true" />
      </button>
    </div>
  );
}

/** A small "label · value" line for detail lists (12-14 px). */
export function KeyValue({ label, value, tone }: { label: React.ReactNode; value: React.ReactNode; tone?: 'danger' | 'success' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-body-sm text-text-2">{label}</span>
      <span className={cn('num text-body-sm font-semibold', tone === 'danger' ? 'text-danger' : tone === 'success' ? 'text-success' : 'text-text')}>{value}</span>
    </div>
  );
}

/** Toggle chips that allow several picks (sauces). */
export function MultiChips({ options, value, onToggle, label }: { options: string[]; value: Record<string, boolean>; onToggle: (option: string) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const on = !!value[option];
        return (
          <button
            key={option}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(option)}
            className={cn(
              'hit-44 inline-flex h-9 min-h-9 items-center rounded-full border px-3.5 text-label font-medium outline-none transition-colors duration-(--dur-fast)',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
              on ? 'border-primary bg-primary-soft font-semibold text-primary' : 'border-border-strong bg-surface text-text hover:bg-surface-2',
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
