import { useState } from 'react';
import { AlertTriangle, Camera, Check, Loader2, Minus, Plus, Receipt, Trash2, Undo2, X } from 'lucide-react';
import { toast } from 'sonner';
import { ASSET_CATEGORIES, ASSET_CONDITIONS, type AssetCategory, type AssetCondition } from '../../utils/assetRules';
import {
  compressPhoto, deleteAsset, dismissAsset, inr, locationKey, restoreAsset, shortDate, updateAsset, uploadAssetPhoto,
  type AssetLocation, type AssetRow,
} from './assetsApi';
import { ConditionBadge, CONDITION_STYLE } from './ConditionBadge';

// One register item: check-and-confirm for an item added from an expense ("review"), edit, or a
// read-only look for staff who can only view their location's list.
type Props = {
  asset: AssetRow;
  mode: 'review' | 'edit' | 'view';
  locations: AssetLocation[];
  editableLocations: string[];
  canDelete: boolean;
  onClose: () => void;
  onSaved: (asset: AssetRow) => void;
  onRemoved: (id: string) => void;
};

export function AssetSheet({ asset, mode, locations, editableLocations, canDelete, onClose, onSaved, onRemoved }: Props) {
  const readOnly = mode === 'view';
  const [name, setName] = useState(asset.name);
  const [category, setCategory] = useState<AssetCategory>(asset.category);
  const [quantity, setQuantity] = useState(String(asset.quantity || 1));
  const [cost, setCost] = useState(asset.totalCost == null ? '' : String(asset.totalCost));
  const [purchaseDate, setPurchaseDate] = useState(asset.purchaseDate || '');
  const [loc, setLoc] = useState(asset.locationId ? locationKey(asset.locationKind, asset.locationId) : '');
  const [condition, setCondition] = useState<AssetCondition>(asset.condition);
  const [notes, setNotes] = useState(asset.notes || '');
  const [preview, setPreview] = useState<string | null>(asset.photoUrl);
  const [busy, setBusy] = useState<string | null>(null);

  // Where it can be moved: the locations this person may edit, plus wherever it is now.
  const locOptions = locations.filter((l) => editableLocations.includes(locationKey(l.kind, l.id)) || locationKey(l.kind, l.id) === loc);
  const locName = (key: string) => locations.find((l) => locationKey(l.kind, l.id) === key)?.name || 'No location yet';

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try { await fn(); } catch (e: any) { toast.error(e?.message || 'Something went wrong'); } finally { setBusy(null); }
  };

  const save = (confirm: boolean) => run(confirm ? 'confirm' : 'save', async () => {
    const q = parseInt(quantity, 10);
    if (!name.trim()) throw new Error('Enter the item name');
    if (!Number.isInteger(q) || q < 1) throw new Error('Quantity must be 1 or more');
    if (!loc) throw new Error('Pick the store or production house');
    const [locationKind, ...rest] = loc.split(':');
    const saved = await updateAsset(asset.id, {
      name: name.trim(),
      category,
      quantity: q,
      totalCost: cost.trim() === '' ? null : Number(cost),
      purchaseDate: purchaseDate || null,
      condition,
      notes,
      locationKind: locationKind as AssetRow['locationKind'],
      locationId: rest.join(':'),
      confirm,
    });
    toast.success(confirm ? 'Confirmed · নিশ্চিত হয়েছে' : 'Saved · সেভ হয়েছে');
    onSaved(saved);
    onClose();
  });

  const pickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await run('photo', async () => {
      const dataUrl = await compressPhoto(file);
      setPreview(dataUrl);
      const saved = await uploadAssetPhoto(asset.id, dataUrl);
      onSaved(saved);
      toast.success('Photo added');
    });
  };

  const resolve = (choice: 'accept' | 'keep') => run(choice, async () => {
    const saved = await updateAsset(asset.id, { resolveExpense: choice });
    onSaved(saved);
    onClose();
  });

  const notEquipment = () => run('dismiss', async () => {
    await dismissAsset(asset.id);
    toast.success('Removed from the list');
    onRemoved(asset.id);
    onClose();
  });

  const bringBack = () => run('restore', async () => {
    const saved = await restoreAsset(asset.id);
    onSaved(saved);
    onClose();
  });

  const remove = () => {
    if (!window.confirm(`Delete "${asset.name}" from the register? This can't be undone.`)) return;
    run('delete', async () => {
      await deleteAsset(asset.id);
      toast.success('Deleted');
      onRemoved(asset.id);
      onClose();
    });
  };

  const field = 'w-full mt-1 px-3 py-2.5 border border-gray-300 rounded-xl text-base bg-white disabled:bg-gray-50 disabled:text-gray-700';
  const label = 'block text-xs font-medium text-gray-700';
  const change = asset.expenseChanged;
  const fromExpense = asset.source?.kind === 'expense';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[92dvh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="min-w-0">
            <p className="font-bold text-gray-900 truncate">
              {mode === 'review' ? 'Check & confirm · যাচাই করুন' : readOnly ? asset.name : 'Edit item · জিনিস বদলান'}
            </p>
            {readOnly && <p className="text-xs text-gray-500">{locName(loc)}</p>}
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-gray-500" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          {fromExpense && (
            <div className="flex items-start gap-2 rounded-xl bg-sky-50 border border-sky-200 p-3 text-xs text-sky-900">
              <Receipt className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p>
                Added from an expense{asset.purchaseDate ? ` of ${shortDate(asset.purchaseDate)}` : ''}.
                {asset.needsReview && !readOnly && ' Check the name, type, count and place, add a photo, then confirm.'}
                {asset.needsReview && !readOnly && <span className="block text-sky-700 mt-0.5">খরচ থেকে যোগ হয়েছে - ঠিক আছে কিনা দেখে নিশ্চিত করুন</span>}
              </p>
            </div>
          )}

          {change && (
            <div className="rounded-xl bg-amber-50 border border-amber-300 p-3 text-sm text-amber-900 space-y-2">
              <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="w-4 h-4" />
                {change.kind === 'changed' ? 'Expense changed · খরচ বদলেছে' : change.kind === 'deleted' ? 'Expense deleted · খরচ মুছে ফেলা হয়েছে' : 'Expense is no longer equipment'}
              </p>
              {change.kind === 'changed' && change.expense && (
                <p className="text-xs">
                  The expense now says: <strong>{change.expense.name}</strong> · {change.expense.quantity} pcs · {inr(change.expense.totalCost)} · {shortDate(change.expense.purchaseDate)}
                  {change.expense.locationId && ` · ${locName(locationKey(change.expense.locationKind, change.expense.locationId))}`}
                </p>
              )}
              {!readOnly && (
                <div className="flex flex-wrap gap-2">
                  {change.kind === 'changed' ? (
                    <>
                      <button type="button" disabled={!!busy} onClick={() => resolve('accept')} className="px-3 py-2 rounded-lg bg-amber-600 text-white text-xs font-semibold disabled:opacity-60">Use the new values</button>
                      <button type="button" disabled={!!busy} onClick={() => resolve('keep')} className="px-3 py-2 rounded-lg bg-white border border-amber-300 text-xs font-semibold disabled:opacity-60">Keep as it is</button>
                    </>
                  ) : (
                    <>
                      <button type="button" disabled={!!busy} onClick={() => resolve('keep')} className="px-3 py-2 rounded-lg bg-white border border-amber-300 text-xs font-semibold disabled:opacity-60">We still have it - keep</button>
                      <button type="button" disabled={!!busy} onClick={notEquipment} className="px-3 py-2 rounded-lg bg-amber-600 text-white text-xs font-semibold disabled:opacity-60">Remove from list</button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {asset.dismissed && (
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-xs text-gray-700 flex items-center justify-between gap-2">
              <span>Removed from the list as "not equipment".</span>
              {!readOnly && (
                <button type="button" disabled={!!busy} onClick={bringBack} className="px-3 py-1.5 rounded-lg bg-white border border-gray-300 font-semibold inline-flex items-center gap-1">
                  <Undo2 className="w-3.5 h-3.5" /> Bring back
                </button>
              )}
            </div>
          )}

          {/* Photo */}
          <div>
            <p className={label}>Photo · ছবি</p>
            {readOnly ? (
              preview ? <img src={preview} alt="" className="mt-1 w-full max-h-64 object-contain rounded-xl bg-gray-100" /> : <p className="mt-1 text-sm text-gray-500">No photo yet</p>
            ) : (
              <label className="mt-1 flex items-center gap-3 p-3 rounded-xl border-2 border-dashed border-orange-300 bg-orange-50/50 cursor-pointer">
                {preview ? <img src={preview} alt="" className="w-20 h-14 object-cover rounded-md" /> : <Camera className="w-6 h-6 text-orange-600" />}
                <span className="text-sm font-semibold text-orange-700 inline-flex items-center gap-2">
                  {busy === 'photo' && <Loader2 className="w-4 h-4 animate-spin" />}
                  {preview ? 'Retake photo · আবার তুলুন' : 'Take photo · ছবি তুলুন'}
                </span>
                <input type="file" accept="image/*" capture="environment" className="hidden" disabled={!!busy} onChange={pickPhoto} />
              </label>
            )}
          </div>

          <label className={label}>
            Name · নাম
            <input value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly} maxLength={80} className={field} />
          </label>

          <div>
            <p className={label}>Type · ধরন</p>
            <div className="mt-1 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {ASSET_CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  disabled={readOnly}
                  onClick={() => setCategory(c.key)}
                  className={`text-left px-2.5 py-2 rounded-lg border text-xs leading-tight ${category === c.key ? 'border-orange-500 bg-orange-50 text-orange-800 font-semibold' : 'border-gray-200 bg-white text-gray-700'} ${readOnly && category !== c.key ? 'hidden' : ''}`}
                >
                  {c.emoji} {c.label}<span className="block text-[10px] text-gray-500 font-normal">{c.bn}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className={label}>How many · কয়টি</p>
              <div className="mt-1 flex items-center gap-1">
                {!readOnly && (
                  <button type="button" aria-label="One less" onClick={() => setQuantity(String(Math.max(1, (parseInt(quantity, 10) || 1) - 1)))} className="p-2.5 rounded-xl border border-gray-300"><Minus className="w-4 h-4" /></button>
                )}
                <input type="number" inputMode="numeric" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} disabled={readOnly} className={`${field} mt-0 text-center`} />
                {!readOnly && (
                  <button type="button" aria-label="One more" onClick={() => setQuantity(String((parseInt(quantity, 10) || 0) + 1))} className="p-2.5 rounded-xl border border-gray-300"><Plus className="w-4 h-4" /></button>
                )}
              </div>
            </div>
            <label className={label}>
              Cost, all pieces (₹) · দাম
              <input type="number" inputMode="decimal" min={0} value={cost} onChange={(e) => setCost(e.target.value)} disabled={readOnly} placeholder="Optional" className={field} />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className={label}>
              Bought on · কেনার দিন
              <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} disabled={readOnly} className={field} />
            </label>
            <label className={label}>
              Where · কোথায়
              <select value={loc} onChange={(e) => setLoc(e.target.value)} disabled={readOnly || (locOptions.length < 2 && !!loc)} className={field}>
                {!loc && <option value="">Pick location</option>}
                {locOptions.map((l) => <option key={locationKey(l.kind, l.id)} value={locationKey(l.kind, l.id)}>{l.name}</option>)}
              </select>
            </label>
          </div>

          <div>
            <p className={label}>Condition · অবস্থা</p>
            {readOnly ? (
              <div className="mt-1"><ConditionBadge condition={condition} /></div>
            ) : (
              <div className="mt-1 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {ASSET_CONDITIONS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setCondition(c.key)}
                    className={`px-2 py-2 rounded-lg border text-xs leading-tight ${condition === c.key ? `${CONDITION_STYLE[c.key]} font-semibold ring-2 ring-offset-1 ring-orange-300` : 'border-gray-200 bg-white text-gray-700'}`}
                  >
                    {c.label}<span className="block text-[10px] font-normal opacity-80">{c.bn}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <label className={label}>
            Notes · নোট
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={readOnly} maxLength={500} rows={2} placeholder={readOnly ? '' : 'Brand, size, where it is kept…'} className={field} />
          </label>

          {(asset.confirmedBy || asset.updatedBy) && (
            <p className="text-[11px] text-gray-500">
              {asset.confirmedBy ? `Confirmed by ${asset.confirmedBy}. ` : ''}Last change {shortDate(asset.updatedAt)} by {asset.updatedBy}.
            </p>
          )}
        </div>

        {!readOnly && (
          <div className="p-4 border-t border-gray-200 space-y-2">
            {mode === 'review' ? (
              <div className="flex gap-2">
                <button type="button" onClick={notEquipment} disabled={!!busy} className="px-3 py-3 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 disabled:opacity-60">
                  Not equipment
                </button>
                <button type="button" onClick={() => save(true)} disabled={!!busy} className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60">
                  {busy === 'confirm' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Confirm · নিশ্চিত করুন
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                {canDelete && (
                  <button type="button" onClick={remove} disabled={!!busy} aria-label="Delete" className="px-3 py-3 rounded-xl border border-red-200 text-red-600 disabled:opacity-60">
                    {busy === 'delete' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                )}
                <button type="button" onClick={() => save(false)} disabled={!!busy} className="flex-1 py-3 rounded-xl bg-orange-600 text-white font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60">
                  {busy === 'save' && <Loader2 className="w-4 h-4 animate-spin" />} Save · সেভ করুন
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
