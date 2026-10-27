// Small layout pieces the polished Insights / Money screens share (WP8): a section heading, the
// "How it works" link that opens a sheet with the long explanation, an overflow menu for the
// secondary actions, and a period chip that drives a screen's own filter keys through the shared
// DateRangeChip (so each screen keeps its own date maths and its numbers stay the same).
import * as React from 'react';
import { CalendarDays, Check, ChevronDown, Info, MoreVertical } from 'lucide-react';
import { SelectChip } from '../../ui/chip';
import { DateRangeChip } from '../../ui/date-range-chip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../ui/dropdown-menu';
import { IconButton } from '../../ui/icon-button';
import { ResponsiveModal } from '../../ui/responsive-modal';
import { Button } from '../../ui/button';
import { RANGE_PRESETS, rangeForPreset, type DateRange, type RangePreset } from '../../ui/date-utils';
import { cn } from '../../ui/utils';
import { useT } from '../../../utils/i18n';

/** Section title (18 px) with an optional caption and actions on the right. */
export function SectionHeading({
  title,
  caption,
  actions,
  as: Tag = 'h2',
  className,
  id,
}: {
  title: React.ReactNode;
  caption?: React.ReactNode;
  actions?: React.ReactNode;
  as?: 'h2' | 'h3';
  className?: string;
  id?: string;
}) {
  return (
    <div className={cn('flex min-w-0 items-start justify-between gap-3', className)}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <Tag id={id} className={cn('font-semibold text-text', Tag === 'h2' ? 'text-title' : 'text-subtitle')}>
          {title}
        </Tag>
        {caption && <p className="text-body-sm text-text-2">{caption}</p>}
      </div>
      {actions && <div className="-mt-1.5 -mr-2 flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}

/** "How it works" link (44 px tall) that opens a sheet holding a long explanation. */
export function HowItWorks({
  title,
  label,
  children,
  className,
}: {
  title: React.ReactNode;
  label?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const { t } = useT();
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex min-h-11 w-fit items-center gap-1.5 rounded-sm text-body-sm font-medium text-primary outline-none hover:text-primary-hover focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
      >
        <Info className="size-4 shrink-0" aria-hidden="true" />
        {label ?? t('wp8.howItWorks')}
      </button>
      <ResponsiveModal
        open={open}
        onOpenChange={setOpen}
        title={title}
        size="form"
        footer={<Button size="lg" variant="secondary" fullWidth onClick={() => setOpen(false)}>{t('common.done')}</Button>}
      >
        <div className="flex flex-col gap-3 text-body-sm text-text-2">{children}</div>
      </ResponsiveModal>
    </>
  );
}

export type OverflowItem = { label: React.ReactNode; icon?: React.ReactNode; onSelect: () => void; disabled?: boolean; danger?: boolean };

/** The secondary actions of a section, behind a 44 px "more" button. */
export function OverflowMenu({ items, label }: { items: (OverflowItem | false | null | undefined)[]; label?: string }) {
  const { t } = useT();
  const shown = items.filter(Boolean) as OverflowItem[];
  if (shown.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton label={label ?? t('common.moreActions')} icon={<MoreVertical />} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-60 rounded-md border-border bg-surface p-1 shadow-e2">
        {shown.map((item, i) => (
          <DropdownMenuItem
            key={i}
            disabled={item.disabled}
            onSelect={item.onSelect}
            className={cn('min-h-11 gap-3 text-body-sm', item.danger ? 'text-danger' : 'text-text')}
          >
            {item.icon}
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The shared "This month ▾" chip for a screen that keeps its own filter keys. `options` maps the
 * chip's presets onto the screen's keys (only those presets are offered); "custom" hands back
 * the picked dates. The screen keeps working out its own range from its key, as before.
 */
export function PeriodChip<F extends string>({
  value,
  options,
  custom,
  onChange,
  className,
}: {
  value: F;
  options: Partial<Record<RangePreset, F>>;
  custom?: { from: string; to: string };
  onChange: (value: F, custom?: { from: string; to: string }) => void;
  className?: string;
}) {
  const presets = RANGE_PRESETS.filter((p) => options[p] !== undefined);
  const preset = (presets.find((p) => options[p] === value) ?? presets[0]) as RangePreset;
  const range: DateRange =
    preset === 'custom' ? { preset, from: custom?.from ?? rangeForPreset('today').from, to: custom?.to ?? rangeForPreset('today').to } : rangeForPreset(preset);
  return (
    <DateRangeChip
      className={className}
      value={range}
      presets={presets}
      onChange={(next) => {
        const key = options[next.preset];
        if (key === undefined) return;
        if (next.preset === 'custom') onChange(key, { from: next.from, to: next.to });
        else onChange(key);
      }}
    />
  );
}

/**
 * A chip showing the current choice ("Last 30 days ▾") that opens a sheet of options - for a
 * screen's own short option list that the shared date presets don't cover.
 */
export function OptionChip<T extends string>({
  value,
  options,
  onChange,
  title,
  icon,
  className,
}: {
  value: T;
  options: { value: T; label: React.ReactNode; description?: React.ReactNode }[];
  onChange: (value: T) => void;
  title: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <SelectChip
        className={className}
        leadingIcon={icon ?? <CalendarDays aria-hidden="true" />}
        trailingIcon={<ChevronDown aria-hidden="true" />}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        {current?.label ?? value}
      </SelectChip>
      <ResponsiveModal open={open} onOpenChange={setOpen} title={title} size="form">
        <div className="overflow-hidden rounded-lg border border-border bg-surface [&>*+*]:border-t [&>*+*]:border-border" role="listbox">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              onClick={() => { onChange(o.value); setOpen(false); }}
              className="flex min-h-13 w-full items-center gap-3 px-4 py-2.5 text-left outline-none hover:bg-surface-2/60 focus-visible:bg-surface-2 active:bg-surface-2"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={cn('text-body-md', o.value === value ? 'font-semibold text-text' : 'text-text')}>{o.label}</span>
                {o.description && <span className="text-label text-text-3">{o.description}</span>}
              </span>
              {o.value === value && <Check className="size-5 shrink-0 text-primary" aria-hidden="true" />}
            </button>
          ))}
        </div>
      </ResponsiveModal>
    </>
  );
}

/**
 * A list row whose details must not be cut off (ListRow clamps its subtitle to two lines):
 * optional icon well, title, any number of detail lines, and something on the right.
 */
export function TextRow({
  icon: Icon,
  iconTone = 'neutral',
  title,
  lines,
  trailing,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  iconTone?: 'neutral' | 'warning' | 'danger' | 'success';
  title: React.ReactNode;
  lines?: React.ReactNode[];
  trailing?: React.ReactNode;
  className?: string;
}) {
  const well = { neutral: 'bg-surface-2 text-text-2', warning: 'bg-warning-soft text-warning', danger: 'bg-danger-soft text-danger', success: 'bg-success-soft text-success' }[iconTone];
  return (
    <div className={cn('flex items-start gap-3 px-4 py-3', className)}>
      {Icon && (
        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-md', well)} aria-hidden="true">
          <Icon className="size-5" />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-body-md font-medium text-text">{title}</span>
        {lines?.filter(Boolean).map((line, i) => (
          <span key={i} className="text-label text-text-3">{line}</span>
        ))}
      </div>
      {trailing && <div className="flex shrink-0 flex-col items-end gap-1">{trailing}</div>}
    </div>
  );
}

/** A figure with a label under it, for compact rows of numbers inside a list row. */
export function MiniFigures({ items, className }: { items: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; tone?: 'default' | 'success' | 'danger' | 'muted' }[]; className?: string }) {
  return (
    <dl className={cn('grid gap-2', className)} style={{ gridTemplateColumns: `repeat(${Math.max(1, items.length)}, minmax(0, 1fr))` }}>
      {items.map((item, i) => (
        <div key={i} className="flex min-w-0 flex-col">
          <dt className="truncate text-caption text-text-3">{item.label}</dt>
          <dd
            className={cn(
              'num text-body-sm font-semibold',
              item.tone === 'success' ? 'text-success' : item.tone === 'danger' ? 'text-danger' : item.tone === 'muted' ? 'text-text-3' : 'text-text',
            )}
          >
            {item.value}
          </dd>
          {item.sub !== undefined && <dd className="num truncate text-caption text-text-3">{item.sub}</dd>}
        </div>
      ))}
    </dl>
  );
}
