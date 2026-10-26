import { useEffect, useMemo, useState } from 'react';
import { X, Trash2, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { InventoryContextType } from '../App';
import * as api from '../utils/api';
import { DatePicker } from './DatePicker';
import { WASTE_REASONS, isPhase1Live } from '../utils/batches';

interface StockWastageModalProps {
  context: InventoryContextType;
  storeId: string;
  finishedProducts: { camelKey: string; label: string }[];
  onClose: () => void;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const STORE_REASONS = WASTE_REASONS.filter((r) => r.where !== 'production');

interface Line {
  id: number;
  type: string;
  qty: string;
  reason: string; // '' only on totals saved before reason codes
}

let nextLineId = 1;
const newLine = (type: string, qty = '', reason = ''): Line => ({ id: nextLineId++, type, qty, reason });

// Daily, store-side momo wastage in pieces - one line per momo type and reason (SOP manual
// 1.7 codes, same letters as the paper waste log), so the day's total also says why. Staff
// meals (S) go here too on their own lines: not waste, but they leave stock the same way.
// Pieces short or damaged at a delivery are added automatically under Q when the store
// receives it. Tracked from this feature's launch (2026-08-30) forward only.
export function StockWastageModal({ context, storeId, finishedProducts, onClose }: StockWastageModalProps) {
  const [date, setDate] = useState(todayISO());
  const [lines, setLines] = useState<Line[]>([]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);

  const accessToken = context.user?.accessToken || '';
  const defaultType = finishedProducts[0]?.camelKey || 'chicken';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getStockWastageEntry(accessToken, storeId, date)
      .then((entry) => {
        if (cancelled) return;
        if (entry) {
          setExistingId(entry.id);
          setNotes(entry.notes || '');
          const loaded: Line[] = [];
          finishedProducts.forEach(({ camelKey }) => {
            const total = entry.wastage?.[camelKey] || 0;
            const byCode = entry.reasons?.[camelKey] || {};
            let coded = 0;
            Object.entries(byCode).forEach(([code, n]) => {
              if (n > 0) {
                loaded.push(newLine(camelKey, String(n), code));
                coded += n;
              }
            });
            if (total > coded) loaded.push(newLine(camelKey, String(total - coded), ''));
          });
          setLines(loaded.length > 0 ? loaded : [newLine(defaultType)]);
        } else {
          setExistingId(null);
          setNotes('');
          setLines([newLine(defaultType)]);
        }
      })
      .catch(() => {
        if (!cancelled) toast.error('Could not load existing wastage entry for this date');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [accessToken, storeId, date, finishedProducts, defaultType]);

  const updateLine = (id: number, patch: Partial<Line>) => setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const totals = useMemo(() => {
    let waste = 0;
    let meals = 0;
    lines.forEach((l) => {
      const n = parseInt(l.qty || '0', 10) || 0;
      if (l.reason === 'S') meals += n; else waste += n;
    });
    return { waste, meals };
  }, [lines]);

  const handleSave = async () => {
    const filled = lines.filter((l) => (parseInt(l.qty || '0', 10) || 0) > 0);
    // A reason on every line is required from Phase 1 go-live; optional before it.
    if (isPhase1Live(date) && filled.some((l) => !l.reason)) {
      toast.error('Pick a reason for every line');
      return;
    }
    setSaving(true);
    try {
      const wastage: Record<string, number> = {};
      const reasons: Record<string, Record<string, number>> = {};
      filled.forEach((l) => {
        const n = parseInt(l.qty, 10) || 0;
        wastage[l.type] = (wastage[l.type] || 0) + n;
        if (l.reason) reasons[l.type] = { ...(reasons[l.type] || {}), [l.reason]: (reasons[l.type]?.[l.reason] || 0) + n };
      });
      await api.saveStockWastageEntry(accessToken, storeId, date, wastage, notes, reasons);
      toast.success(`Wastage saved for ${date}`);
      onClose();
    } catch (error) {
      console.error('Error saving stock wastage:', error);
      toast.error('Failed to save wastage entry');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full my-8">
        <div className="relative overflow-hidden bg-gradient-to-r from-red-600 via-rose-500 to-red-600 p-6 rounded-t-2xl">
          <div className="absolute inset-0 bg-white/10" />
          <div className="relative flex items-center justify-between gap-3">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center border-2 border-white/30 flex-shrink-0">
                <Trash2 className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-white tracking-tight">Stock Wastage</h2>
                <p className="text-white/80 text-xs">Pieces by momo type and reason</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-all flex-shrink-0" aria-label="Close">
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <DatePicker label="Date" value={date} onChange={setDate} max={todayISO()} />

          {loading ? (
            <div className="flex items-center justify-center py-10 text-gray-500 gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading...</span>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {lines.map((l) => (
                  <div key={l.id} className="grid grid-cols-[1fr_4.5rem_auto] gap-2 items-center">
                    <select
                      value={l.type}
                      onChange={(e) => updateLine(l.id, { type: e.target.value })}
                      aria-label="Momo type"
                      className="min-w-0 px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
                    >
                      {finishedProducts.map(({ camelKey, label }) => <option key={camelKey} value={camelKey}>{label}</option>)}
                    </select>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      placeholder="pcs"
                      value={l.qty}
                      onChange={(e) => updateLine(l.id, { qty: e.target.value })}
                      aria-label="Pieces"
                      className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-right tabular-nums"
                    />
                    <button type="button" onClick={() => setLines((prev) => prev.filter((x) => x.id !== l.id))} className="p-1.5 text-gray-400 hover:text-red-600" aria-label="Remove line">
                      <X className="w-4 h-4" />
                    </button>
                    <select
                      value={l.reason}
                      onChange={(e) => updateLine(l.id, { reason: e.target.value })}
                      aria-label="Reason"
                      className={`col-span-3 -mt-1 px-2 py-1.5 border rounded-lg text-sm ${l.reason || !isPhase1Live(date) ? 'border-gray-300' : 'border-amber-300 bg-amber-50 text-amber-800'}`}
                    >
                      <option value="">{l.qty && existingId ? 'No reason saved - pick one' : 'Reason...'}</option>
                      {STORE_REASONS.map((r) => <option key={r.code} value={r.code}>{r.code} · {r.label}</option>)}
                    </select>
                  </div>
                ))}
                <button type="button" onClick={() => setLines((prev) => [...prev, newLine(defaultType)])} className="inline-flex items-center gap-1 text-sm font-medium text-red-700">
                  <Plus className="w-4 h-4" /> Add line
                </button>
              </div>

              <div className="pt-2 border-t border-gray-100 text-sm space-y-1">
                <div className="flex items-center justify-between font-semibold text-gray-900">
                  <span>Total wasted</span>
                  <span className="tabular-nums">{totals.waste} pcs</span>
                </div>
                {totals.meals > 0 && (
                  <div className="flex items-center justify-between text-gray-600">
                    <span>Staff meals</span>
                    <span className="tabular-nums">{totals.meals} pcs</span>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="wastage-notes" className="text-xs font-medium text-gray-600">Notes (optional)</label>
                <textarea
                  id="wastage-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="What happened, in a few words"
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none"
                />
              </div>

              {existingId && (
                <p className="text-xs text-amber-600">An entry already exists for this date - saving will overwrite it.</p>
              )}
            </>
          )}
        </div>

        <div className="flex gap-3 p-5 pt-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save Wastage'}
          </button>
        </div>
      </div>
    </div>
  );
}
