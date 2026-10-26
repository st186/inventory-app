import { useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronUp, Loader2, Pencil } from 'lucide-react';
import type { InventoryItem } from '../App';
import { checkPurchase, type PriceFix, type PriceFlag, type PriceGuide } from '../utils/expenseChecks';
import { formatDateIST } from '../utils/timezone';

// Price checks on purchases (utils/expenseChecks.ts): a warning while an entry is typed in, and
// a list of older entries whose price looks wrong, each with a fix.

const UNIT_CHOICES = ['kg', 'g', 'L', 'mL', 'pcs', 'units', 'bundle'];

export function PriceWarning({ flag, onFix }: { flag: PriceFlag | null; onFix?: (fix: PriceFix) => void }) {
  if (!flag) return null;
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-300 bg-amber-50" role="status">
      <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-amber-900">{flag.message} Check the quantity and unit.</p>
        {flag.fix && onFix && (
          <button
            type="button"
            onClick={() => onFix(flag.fix!)}
            className="mt-1.5 px-2.5 py-1.5 rounded-md bg-amber-600 text-white text-xs font-semibold"
          >
            {flag.fix.exact ? flag.fix.label : `Use ${flag.fix.label.replace(/^About /, '').replace(/\?$/, '')}`}
          </button>
        )}
      </div>
    </div>
  );
}

type Changes = { quantity: number; unit: string } | { priceCheckOk: true };

export function PriceCheckPanel({ entries, guide, onSave, onEdit }: {
  entries: InventoryItem[];
  guide: PriceGuide;
  onSave: (item: InventoryItem, changes: Changes) => Promise<void>;
  onEdit: (item: InventoryItem) => void;
}) {
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
      alert(e?.message || 'Could not save');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/60">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-3 sm:p-4 text-left"
        aria-expanded={open}
      >
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900">
            {flagged.length === 1 ? '1 purchase looks wrong' : `${flagged.length} purchases look wrong`}
          </p>
          <p className="text-xs text-amber-800/80">Usually a unit slip - grams saved instead of kg, or a crate saved as 1 piece. The amount paid stays the same.</p>
        </div>
        {open ? <ChevronUp className="w-5 h-5 text-amber-700" /> : <ChevronDown className="w-5 h-5 text-amber-700" />}
      </button>

      {open && (
        <ul className="px-3 pb-3 sm:px-4 sm:pb-4 space-y-2">
          {flagged.slice(0, shown).map(({ item, flag }) => {
            const busy = busyId === item.id;
            const isEditing = editing?.id === item.id;
            const units = UNIT_CHOICES.includes(item.unit) ? UNIT_CHOICES : [item.unit, ...UNIT_CHOICES];
            return (
              <li key={item.id} className="bg-white rounded-lg border border-amber-100 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">
                      {item.itemName} <span className="font-normal text-gray-500">· {formatDateIST(item.date)}</span>
                    </p>
                    <p className="text-xs text-gray-700 mt-0.5">
                      Saved as <span className="font-semibold">{item.quantity} {item.unit}</span> for ₹{item.totalCost.toLocaleString('en-IN')}
                      {item.createdByName ? <span className="text-gray-400"> · {item.createdByName}</span> : null}
                    </p>
                    <p className={`text-xs mt-0.5 ${flag.severity === 'high' ? 'text-rose-700' : 'text-amber-800'}`}>{flag.message}</p>
                  </div>
                  {busy && <Loader2 className="w-4 h-4 animate-spin text-gray-400 flex-shrink-0" />}
                </div>

                {isEditing ? (
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <label className="text-[11px] text-gray-600">Quantity
                      <input
                        type="number"
                        step="0.01"
                        value={editing.quantity}
                        onChange={(e) => setEditing({ ...editing, quantity: e.target.value })}
                        className="block w-28 mt-0.5 px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                      />
                    </label>
                    <label className="text-[11px] text-gray-600">Unit
                      <select
                        value={editing.unit}
                        onChange={(e) => setEditing({ ...editing, unit: e.target.value })}
                        className="block mt-0.5 px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
                      >
                        {units.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={busy || !(parseFloat(editing.quantity) > 0)}
                      onClick={() => save(item, { quantity: parseFloat(editing.quantity), unit: editing.unit })}
                      className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button type="button" onClick={() => setEditing(null)} className="px-3 py-1.5 rounded-md border border-gray-300 text-xs text-gray-700">Cancel</button>
                    <p className="w-full text-[11px] text-gray-500">Worked out from the usual price - check the bill and correct the number if needed.</p>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {flag.fix?.exact && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => save(item, { quantity: flag.fix!.quantity, unit: flag.fix!.unit })}
                        className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50"
                      >
                        {flag.fix.label}
                      </button>
                    )}
                    {flag.fix && !flag.fix.exact && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setEditing({ id: item.id, quantity: String(flag.fix!.quantity), unit: flag.fix!.unit })}
                        className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50"
                      >
                        Fix quantity ({flag.fix.label.toLowerCase()})
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => save(item, { priceCheckOk: true })}
                      className="px-3 py-1.5 rounded-md border border-gray-300 text-xs text-gray-700 inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" /> It's right
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onEdit(item)}
                      className="px-3 py-1.5 rounded-md border border-gray-300 text-xs text-gray-700 inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                  </div>
                )}
              </li>
            );
          })}
          {flagged.length > shown && (
            <li>
              <button type="button" onClick={() => setShown(shown + 10)} className="w-full py-2 text-xs font-semibold text-amber-800">
                Show {Math.min(10, flagged.length - shown)} more of {flagged.length - shown}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
