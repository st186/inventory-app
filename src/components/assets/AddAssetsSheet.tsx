import { useState } from 'react';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { ASSET_CATEGORIES, guessAssetCategory, type AssetCategory } from '../../utils/assetRules';
import { createAssets, locationKey, type AssetLocation, type AssetRow } from './assetsApi';

// Listing what a location already has: one quick row per item (name, how many, type, cost if
// known). Photos and condition can be added afterwards from the item itself.
type Row = { key: number; name: string; quantity: string; category: AssetCategory; cost: string; picked: boolean };

// The usual kit, so a whole kitchen can be listed in a few taps.
const QUICK_PICKS = [
  'Momo steamer', 'Deep freezer', 'Fridge', 'Gas stove', 'Induction', 'Fryer', 'Kadai', 'Tawa', 'Mixer grinder',
  'Weighing scale', 'Steel container', 'Storage rack', 'Dustbin', 'Bucket', 'Table', 'Chair', 'Fan', 'Tube light',
];

let nextKey = 1;
const emptyRow = (name = ''): Row => ({ key: nextKey++, name, quantity: '1', category: name ? guessAssetCategory(name) : 'other', cost: '', picked: false });

type Props = {
  locations: AssetLocation[];
  editableLocations: string[];
  defaultLocation: string;
  onClose: () => void;
  onAdded: (rows: AssetRow[]) => void;
};

export function AddAssetsSheet({ locations, editableLocations, defaultLocation, onClose, onAdded }: Props) {
  const options = locations.filter((l) => editableLocations.includes(locationKey(l.kind, l.id)));
  const [loc, setLoc] = useState(options.some((l) => locationKey(l.kind, l.id) === defaultLocation) ? defaultLocation : (options[0] ? locationKey(options[0].kind, options[0].id) : ''));
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [saving, setSaving] = useState(false);

  const patch = (key: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => {
    if (r.key !== key) return r;
    const next = { ...r, ...p };
    // Guess the type from the name until someone picks one themselves.
    if (p.name !== undefined && !next.picked) next.category = guessAssetCategory(p.name);
    return next;
  }));

  const quickAdd = (name: string) => setRows((rs) => {
    const blank = rs.find((r) => !r.name.trim());
    return blank ? rs.map((r) => (r.key === blank.key ? { ...r, name, category: r.picked ? r.category : guessAssetCategory(name) } : r)) : [...rs, emptyRow(name)];
  });

  const save = async () => {
    const filled = rows.filter((r) => r.name.trim());
    if (!loc) return toast.error('Pick the store or production house');
    if (!filled.length) return toast.error('Add at least one item');
    const bad = filled.find((r) => !(parseInt(r.quantity, 10) >= 1));
    if (bad) return toast.error(`How many "${bad.name}"? Enter 1 or more`);
    const [locationKind, ...rest] = loc.split(':');
    setSaving(true);
    try {
      const added = await createAssets(filled.map((r) => ({
        name: r.name.trim(),
        quantity: parseInt(r.quantity, 10),
        category: r.category,
        totalCost: r.cost.trim() === '' ? null : Number(r.cost),
        locationKind: locationKind as AssetRow['locationKind'],
        locationId: rest.join(':'),
      })));
      toast.success(`${added.length} item${added.length === 1 ? '' : 's'} added · যোগ হয়েছে`);
      onAdded(added);
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Could not add the items');
    } finally {
      setSaving(false);
    }
  };

  const field = 'w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl max-h-[92dvh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <p className="font-bold text-gray-900">Add what we have · যা আছে যোগ করুন</p>
            <p className="text-xs text-gray-500">Name and how many is enough - cost is optional.</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-gray-500" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          <label className="block text-xs font-medium text-gray-700">
            Where · কোথায়
            <select value={loc} onChange={(e) => setLoc(e.target.value)} disabled={options.length < 2} className={`${field} mt-1 text-base py-2.5 rounded-xl`}>
              {!loc && <option value="">Pick location</option>}
              {options.map((l) => <option key={locationKey(l.kind, l.id)} value={locationKey(l.kind, l.id)}>{l.name}</option>)}
            </select>
          </label>

          <div>
            <p className="text-xs font-medium text-gray-700 mb-1.5">Quick add · দ্রুত যোগ</p>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_PICKS.map((n) => (
                <button key={n} type="button" onClick={() => quickAdd(n)} className="px-2.5 py-1.5 rounded-full border border-orange-200 bg-orange-50 text-orange-800 text-xs font-medium">
                  + {n}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={r.key} className="rounded-xl border border-gray-200 p-2.5 space-y-2 bg-gray-50/60">
                <div className="flex gap-2">
                  <input
                    value={r.name}
                    onChange={(e) => patch(r.key, { name: e.target.value })}
                    placeholder={`Item ${i + 1} - e.g. Steel kadai`}
                    maxLength={80}
                    className={`${field} flex-1`}
                    aria-label="Item name"
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={r.quantity}
                    onChange={(e) => patch(r.key, { quantity: e.target.value })}
                    className={`${field} w-16 text-center`}
                    aria-label="How many"
                  />
                  {rows.length > 1 && (
                    <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="p-2 text-gray-400" aria-label="Remove row">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <select
                    value={r.category}
                    onChange={(e) => patch(r.key, { category: e.target.value as AssetCategory, picked: true })}
                    className={`${field} flex-1`}
                    aria-label="Type"
                  >
                    {ASSET_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.emoji} {c.label} · {c.bn}</option>)}
                  </select>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={r.cost}
                    onChange={(e) => patch(r.key, { cost: e.target.value })}
                    placeholder="₹ cost"
                    className={`${field} w-24`}
                    aria-label="Cost for all pieces"
                  />
                </div>
              </div>
            ))}
            <button type="button" onClick={() => setRows((rs) => [...rs, emptyRow()])} className="w-full py-2.5 rounded-xl border-2 border-dashed border-gray-300 text-sm font-semibold text-gray-600 inline-flex items-center justify-center gap-1.5">
              <Plus className="w-4 h-4" /> Another item · আরও একটি
            </button>
          </div>
        </div>

        <div className="p-4 border-t border-gray-200">
          <button type="button" onClick={save} disabled={saving} className="w-full py-3 rounded-xl bg-orange-600 text-white font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Add {rows.filter((r) => r.name.trim()).length || ''} item{rows.filter((r) => r.name.trim()).length === 1 ? '' : 's'} · যোগ করুন
          </button>
        </div>
      </div>
    </div>
  );
}
