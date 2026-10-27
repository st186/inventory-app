// "Paid from" for every expense sheet: Cash / Paytm / Split (+ Owner for the owner), the line
// saying which till it comes off, and the two split amounts. The value names stay the server's
// ('cash' | 'online' | 'both' | 'owner').
import * as React from 'react';
import { Trash2 } from 'lucide-react';
import { useT } from '../../utils/i18n';
import { Field } from '../ui/field';
import { IconButton } from '../ui/icon-button';
import { MoneyInput, formatINR } from '../ui/money';
import { SegmentedControl } from '../ui/segmented-control';

export type PaidFrom = 'cash' | 'online' | 'both' | 'owner';

export function PaidFromField({ value, onChange, showOwner, entity, allowed, children }: {
  value: PaidFrom;
  onChange: (value: PaidFrom) => void;
  showOwner?: boolean;
  entity?: 'store' | 'production';
  /** Limit the choices (Quick Add: cash only for staff; owner, cash or Paytm for the owner). */
  allowed?: PaidFrom[];
  /** Shown under the choice (production cash tick box, split amounts). */
  children?: React.ReactNode;
}) {
  const { t } = useT();
  const options: { value: PaidFrom; label: string }[] = [
    { value: 'cash' as const, label: t('money.cash') },
    { value: 'online' as const, label: t('money.paytm') },
    { value: 'both' as const, label: t('money.split') },
    ...(showOwner ? [{ value: 'owner' as const, label: t('paid.ownerOption') }] : []),
  ].filter((o) => !allowed || allowed.includes(o.value));
  const hint = value === 'cash'
    ? (entity === 'production' ? t('paid.hint.cashProduction') : t('paid.hint.cashStore'))
    : value === 'online' ? t('paid.hint.paytm') : value === 'both' ? t('paid.hint.split') : t('paid.hint.owner');
  return (
    <div className="flex flex-col gap-2">
      <span className="text-body-sm font-medium text-text">{t('money.paidFrom')}</span>
      {options.length > 1 ? (
        <SegmentedControl aria-label={t('money.paidFrom')} value={value} onValueChange={onChange} options={options} />
      ) : (
        <span className="text-body text-text">{options[0]?.label}</span>
      )}
      <span className="text-caption text-text-3">{hint}</span>
      {children}
    </div>
  );
}

/** Cash part + Paytm part of a split bill, with the running check against the total. */
export function SplitAmounts({ cash, online, total, onChange }: {
  cash: string;
  online: string;
  total: number;
  onChange: (next: { cash: string; online: string }) => void;
}) {
  const { t } = useT();
  const sum = (parseFloat(cash || '0') || 0) + (parseFloat(online || '0') || 0);
  const ok = Math.abs(sum - total) < 0.01;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2 p-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('exp.splitCash')}>
          <MoneyInput value={cash} onValueChange={(_, raw) => onChange({ cash: raw, online })} />
        </Field>
        <Field label={t('exp.splitPaytm')}>
          <MoneyInput value={online} onValueChange={(_, raw) => onChange({ cash, online: raw })} />
        </Field>
      </div>
      {total > 0 && (
        <p className={ok ? 'text-caption text-success' : 'text-caption text-danger'} role={ok ? undefined : 'alert'}>
          <span className="num">{formatINR(sum)} / {formatINR(total)}</span>
          {!ok && <> · {t('exp.splitMustMatch', { amount: formatINR(total) })}</>}
        </p>
      )}
    </div>
  );
}

/** Trash button for an edit sheet's header. */
export function DeleteAction({ onDelete }: { onDelete?: () => void }) {
  const { t } = useT();
  if (!onDelete) return null;
  return <IconButton label={t('exp.deleteConfirm')} icon={<Trash2 />} variant="danger-ghost" onClick={onDelete} />;
}
