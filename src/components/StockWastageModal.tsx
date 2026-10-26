import { useEffect, useMemo, useState } from 'react';
import { X, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { InventoryContextType } from '../App';
import * as api from '../utils/api';
import { DatePicker } from './DatePicker';

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

// Daily, store-side momo wastage in pieces - one number per momo type (all 7 canonical
// types, including both kurkure varieties, via the same dynamic finishedProducts list
// ProductionRequests.tsx already builds from active inventory items). Tracked from this
// feature's launch (2026-08-30) forward only - there's no reliable historical wastage data
// to backfill.
export function StockWastageModal({ context, storeId, finishedProducts, onClose }: StockWastageModalProps) {
  const [date, setDate] = useState(todayISO());
  const [values, setValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);

  const accessToken = context.user?.accessToken || '';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getStockWastageEntry(accessToken, storeId, date)
      .then((entry) => {
        if (cancelled) return;
        if (entry) {
          setExistingId(entry.id);
          setNotes(entry.notes || '');
          const next: Record<string, string> = {};
          finishedProducts.forEach(({ camelKey }) => {
            const v = entry.wastage?.[camelKey];
            if (v) next[camelKey] = String(v);
          });
          setValues(next);
        } else {
          setExistingId(null);
          setNotes('');
          setValues({});
        }
      })
      .catch(() => {
        if (!cancelled) toast.error('Could not load existing wastage entry for this date');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [accessToken, storeId, date, finishedProducts]);

  const total = useMemo(() => {
    return Object.values(values).reduce((sum, v) => sum + (parseInt(v, 10) || 0), 0);
  }, [values]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const wastage: Record<string, number> = {};
      finishedProducts.forEach(({ camelKey }) => {
        const n = parseInt(values[camelKey] || '0', 10);
        if (n > 0) wastage[camelKey] = n;
      });
      await api.saveStockWastageEntry(accessToken, storeId, date, wastage, notes);
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
                <p className="text-white/80 text-xs">Pieces wasted, by momo type</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-all flex-shrink-0">
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
                {finishedProducts.map(({ camelKey, label }) => (
                  <div key={camelKey} className="flex items-center justify-between gap-3">
                    <label htmlFor={`wastage-${camelKey}`} className="text-sm text-gray-700">{label}</label>
                    <input
                      id={`wastage-${camelKey}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      placeholder="0"
                      value={values[camelKey] || ''}
                      onChange={(e) => setValues((prev) => ({ ...prev, [camelKey]: e.target.value }))}
                      className="w-24 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-right"
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-sm font-semibold text-gray-900">
                <span>Total wasted</span>
                <span className="tabular-nums">{total} pcs</span>
              </div>

              <div>
                <label htmlFor="wastage-notes" className="text-xs font-medium text-gray-600">Notes (optional)</label>
                <textarea
                  id="wastage-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="e.g. spoiled overnight, dropped during prep..."
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
