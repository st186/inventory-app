import { useMemo, useState } from 'react';
import { Check, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import type { InventoryItem } from '../App';
import { checkPurchase, type PriceFix, type PriceFlag, type PriceGuide } from '../utils/expenseChecks';
import { formatDateIST } from '../utils/timezone';
import { useT } from '../utils/i18n';
import { Button } from './ui/button';
import { Callout } from './ui/callout';
import { ChoiceChips } from './ui/chip';
import { Field } from './ui/field';
import { Input } from './ui/input';
import { formatINR } from './ui/money';
import { ResponsiveModal } from './ui/responsive-modal';

// Price checks on purchases (utils/expenseChecks.ts): a warning while an entry is typed in, and
// a callout opening the list of older entries whose price looks wrong, each with a fix.

const UNIT_CHOICES = ['kg', 'g', 'L', 'mL', 'pcs', 'units', 'bundle'];

export function PriceWarning({ flag, onFix }: { flag: PriceFlag | null; onFix?: (fix: PriceFix) => void }) {
  if (!flag) return null;
  return (
    <Callout
      tone={flag.severity === 'high' ? 'danger' : 'warning'}
      title={`${flag.message} Check the quantity and unit.`}
      action={flag.fix && onFix ? (
        <Button variant="secondary" size="sm" onClick={() => onFix(flag.fix!)}>
          {flag.fix.exact ? flag.fix.label : `Use ${flag.fix.label.replace(/^About /, '').replace(/\?$/, '')}`}
        </Button>
      ) : undefined}
    />
  );
}

type Changes = { quantity: number; unit: string } | { priceCheckOk: true };

export function PriceCheckPanel({ entries, guide, onSave, onEdit }: {
  entries: InventoryItem[];
  guide: PriceGuide;
  onSave: (item: InventoryItem, changes: Changes) => Promise<void>;
  onEdit: (item: InventoryItem) => void;
}) {
  const { t } = useT();
  const flagged = useMemo(
    () => entries
      .map((item) => ({ item, flag: checkPurchase(item, guide) }))
      .filter((x): x is { item: InventoryItem; flag: PriceFlag } => !!x.flag)
      .sort((a, b) => b.item.date.localeCompare(a.item.date)),
    [entries, guide]
  );
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(10);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; quantity: string; unit: string } | null>(null);

  if (flagged.length === 0) return null;

  const save = async (item: InventoryItem, changes: Changes) => {
    setBusyId(item.id);
    try {
      await onSave(item, changes);
      setEditing(null);
    } catch (e: any) {
      toast.error(e?.message || 'Could not save');
    } finally {
      setBusyId(null);
    }
  };
  const first = flagged[0];

  return (
    <>
      <Callout
        tone="warning"
        title={flagged.length === 1 ? t('exp.priceWrong1') : t('exp.pricesWrong', { n: flagged.length })}
        onClick={() => setOpen(true)}
      >
        {`${first.item.itemName} ${formatINR(first.item.totalCost)} for ${first.item.quantity} ${first.item.unit}? `}{t('exp.pricesWrongBody')}
      </Callout>

      <ResponsiveModal open={open} onOpenChange={setOpen} title={flagged.length === 1 ? t('exp.priceWrong1') : t('exp.pricesWrong', { n: flagged.length })} description={t('exp.pricesWrongSub')} size="detail">
        <ul className="flex flex-col gap-3">
          {flagged.slice(0, shown).map(({ item, flag }) => {
            const busy = busyId === item.id;
            const isEditing = editing?.id === item.id;
            const units = UNIT_CHOICES.includes(item.unit) ? UNIT_CHOICES : [item.unit, ...UNIT_CHOICES];
            return (
              <li key={item.id} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
                <div className="flex flex-col gap-0.5">
                  <p className="text-body-md font-semibold text-text">
                    {item.itemName} <span className="font-normal text-text-3">· {formatDateIST(item.date)}</span>
                  </p>
                  <p className="text-body-sm text-text-2">
                    Saved as <span className="num font-semibold text-text">{item.quantity} {item.unit}</span> for <span className="num">{formatINR(item.totalCost)}</span>
                    {item.createdByName ? <span className="text-text-3"> · {item.createdByName}</span> : null}
                  </p>
                  <p className={flag.severity === 'high' ? 'text-body-sm text-danger' : 'text-body-sm text-warning'}>{flag.message}</p>
                </div>

                {isEditing ? (
                  <div className="flex flex-col gap-3">
                    <Field label="Quantity" helper="Worked out from the usual price - check the bill and correct the number if needed.">
                      <Input inputMode="decimal" value={editing.quantity} onChange={(e) => setEditing({ ...editing, quantity: e.target.value })} className="num" />
                    </Field>
                    <ChoiceChips aria-label="Unit" value={editing.unit} onValueChange={(u) => setEditing({ ...editing, unit: u })} options={units.map((u) => ({ value: u, label: u }))} />
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
                      <Button variant="secondary" size="sm" loading={busy} disabled={!(parseFloat(editing.quantity) > 0)} onClick={() => save(item, { quantity: parseFloat(editing.quantity), unit: editing.unit })}>{t('common.save')}</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {flag.fix?.exact && (
                      <Button variant="secondary" size="sm" loading={busy} onClick={() => save(item, { quantity: flag.fix!.quantity, unit: flag.fix!.unit })}>{flag.fix.label}</Button>
                    )}
                    {flag.fix && !flag.fix.exact && (
                      <Button variant="secondary" size="sm" disabled={busy} onClick={() => setEditing({ id: item.id, quantity: String(flag.fix!.quantity), unit: flag.fix!.unit })}>
                        Fix quantity ({flag.fix.label.toLowerCase()})
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" leadingIcon={<Check />} disabled={busy} onClick={() => save(item, { priceCheckOk: true })}>It's right</Button>
                    {/* The edit sheet replaces this one (never a sheet on a sheet). */}
                    <Button variant="ghost" size="sm" leadingIcon={<Pencil />} disabled={busy} onClick={() => { setOpen(false); onEdit(item); }}>{t('common.edit')}</Button>
                  </div>
                )}
              </li>
            );
          })}
          {flagged.length > shown && (
            <li>
              <Button variant="ghost" fullWidth onClick={() => setShown(shown + 10)}>
                Show {Math.min(10, flagged.length - shown)} more of {flagged.length - shown}
              </Button>
            </li>
          )}
        </ul>
      </ResponsiveModal>
    </>
  );
}
