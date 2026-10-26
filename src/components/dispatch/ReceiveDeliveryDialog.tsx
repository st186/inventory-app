import { useMemo, useState } from 'react';
import { X, Camera, Loader2, PackageCheck, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import * as api from '../../utils/api';
import type { ProductionRequest } from '../../utils/api';
import { RECEIPT_DAMAGE_REASONS, ReceiptDamageReason, bagSize, bagsLabel } from '../../utils/batches';

type Labels = { camelKey: string; label: string }[];
const shortLabel = (label: string) => label.replace(/ Momos?$/, '');

// Phone photos are 3-5 MB; a 1024px JPEG at 60% is ~100 KB and still shows a crushed bag.
async function compressImage(file: File, maxDim = 1024, quality = 0.6): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

interface LineDraft {
  received: number;
  damaged: number;
  damageReason: ReceiptDamageReason;
  damageBatch: string;
}

type Props = {
  request: ProductionRequest;
  products: Labels;
  accessToken: string;
  onClose: () => void;
  onReceived: (request: ProductionRequest) => void;
};

// The store's count of a delivery (SOP 1.5, bottom half, and picture guide "Store receiving"):
// count bags against the slip, check the momos are hard, record anything crushed, stuck or
// soft with its batch code and a photo. Short and damaged pieces are logged as waste (Q).
export function ReceiveDeliveryDialog({ request, products, accessToken, onClose, onReceived }: Props) {
  const shippedProducts = useMemo(
    () => products.filter(({ camelKey }) => (request.shippedQuantities?.[camelKey] || 0) > 0),
    [products, request.shippedQuantities]
  );
  const [lines, setLines] = useState<Record<string, LineDraft>>(() => Object.fromEntries(
    shippedProducts.map(({ camelKey }) => [camelKey, { received: request.shippedQuantities?.[camelKey] || 0, damaged: 0, damageReason: 'crushed' as ReceiptDamageReason, damageBatch: '' }])
  ));
  const sentSauces = useMemo(
    () => Object.keys(request.sauces || {}).filter((s) => request.sauces?.[s] && (request.shippedSauces ? request.shippedSauces[s] : true)),
    [request.sauces, request.shippedSauces]
  );
  const [saucesMissing, setSaucesMissing] = useState<string[]>([]);
  const [boxesReceived, setBoxesReceived] = useState(request.dispatch?.boxes ? String(request.dispatch.boxes) : '');
  const [hardFrozen, setHardFrozen] = useState<boolean | null>(null);
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const setLine = (key: string, patch: Partial<LineDraft>) => setLines((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  const anyDamage = Object.values(lines).some((l) => l.damaged > 0);
  const needsPhoto = anyDamage || hardFrozen === false;

  const addPhoto = async (file?: File) => {
    if (!file) return;
    try {
      const dataUrl = await compressImage(file);
      setPhotos((prev) => [...prev, dataUrl].slice(0, 4));
    } catch {
      toast.error('Could not read that photo - try again');
    }
  };

  const save = async () => {
    if (hardFrozen === null) {
      toast.error('Say whether the momos arrived hard frozen');
      return;
    }
    if (needsPhoto && photos.length === 0) {
      toast.error('Add a photo of the damaged or soft momos');
      return;
    }
    setSaving(true);
    try {
      const photoIds: string[] = [];
      for (const dataUrl of photos) {
        photoIds.push(await api.uploadReceiptPhoto(accessToken, request.id, dataUrl));
      }
      const updated = await api.receiveProductionRequest(accessToken, request.id, {
        lines: Object.fromEntries(Object.entries(lines).map(([key, l]) => [key, {
          shipped: request.shippedQuantities?.[key] || 0,
          received: l.received,
          damaged: l.damaged,
          ...(l.damaged > 0 ? { damageReason: l.damageReason, damageBatch: l.damageBatch || undefined } : {}),
        }])),
        saucesMissing,
        boxesReceived: boxesReceived === '' ? undefined : parseInt(boxesReceived, 10) || 0,
        hardFrozen,
        notes: notes.trim() || undefined,
        photoIds,
      });
      toast.success('Delivery received');
      onReceived(updated);
    } catch (error: any) {
      toast.error(error?.message || 'Could not save the delivery');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl">
        <div className="bg-green-700 p-5 text-white rounded-t-xl flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2"><PackageCheck className="w-6 h-6" /> Receive delivery</h2>
            <p className="text-green-100 text-sm mt-1">Count the bags against the slip before anything goes in the freezer.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          <div className="space-y-3">
            {shippedProducts.map(({ camelKey, label }) => {
              const shipped = request.shippedQuantities?.[camelKey] || 0;
              const l = lines[camelKey];
              const size = bagSize(camelKey);
              const diff = l.received - shipped;
              const batches = request.dispatch?.batches?.[camelKey] || [];
              return (
                <div key={camelKey} className={`border rounded-lg p-3 ${diff !== 0 || l.damaged > 0 ? 'border-red-300 bg-red-50/50' : 'border-gray-200'}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-sm font-semibold text-gray-900">{shortLabel(label)}</p>
                    <p className="text-xs text-gray-500 text-right">Sent {bagsLabel(shipped, camelKey)} ({shipped})</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setLine(camelKey, { received: Math.max(0, Math.ceil(l.received / size) * size - size) })} className="w-10 h-10 flex-shrink-0 border-2 border-gray-300 rounded-lg font-bold" aria-label={`One bag less ${label}`}>−</button>
                    <div className="flex-1 text-center">
                      <p className="text-base font-bold tabular-nums">{bagsLabel(l.received, camelKey)}</p>
                      <p className="text-xs text-gray-500">counted</p>
                    </div>
                    <button type="button" onClick={() => setLine(camelKey, { received: Math.floor(l.received / size) * size + size })} className="w-10 h-10 flex-shrink-0 border-2 border-gray-300 rounded-lg font-bold" aria-label={`One bag more ${label}`}>+</button>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={l.received}
                      onChange={(e) => setLine(camelKey, { received: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                      aria-label={`${label} pieces received`}
                      className="w-20 px-2 py-2 border border-gray-300 rounded-lg text-right tabular-nums"
                    />
                  </div>
                  {diff !== 0 && (
                    <p className={`text-xs font-semibold mt-1 ${diff < 0 ? 'text-red-700' : 'text-amber-700'}`}>{diff < 0 ? `${-diff} short` : `${diff} extra`}</p>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <label htmlFor={`dmg-${camelKey}`} className="text-xs text-gray-700 flex-1">Crushed, stuck or soft (pcs)</label>
                    <input
                      id={`dmg-${camelKey}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={l.damaged || ''}
                      placeholder="0"
                      onChange={(e) => setLine(camelKey, { damaged: Math.min(l.received, Math.max(0, parseInt(e.target.value, 10) || 0)) })}
                      className="w-20 px-2 py-1.5 border border-gray-300 rounded-lg text-right tabular-nums"
                    />
                  </div>
                  {l.damaged > 0 && (
                    <div className="mt-2 space-y-2">
                      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="What was wrong">
                        {RECEIPT_DAMAGE_REASONS.map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            role="radio"
                            aria-checked={l.damageReason === r.id}
                            onClick={() => setLine(camelKey, { damageReason: r.id })}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium border ${l.damageReason === r.id ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-700 border-gray-300'}`}
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                      <select
                        value={l.damageBatch}
                        onChange={(e) => setLine(camelKey, { damageBatch: e.target.value })}
                        aria-label="Batch code on the damaged bag"
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
                      >
                        <option value="">Batch code on the bag (if known)</option>
                        {batches.map((b) => <option key={b.code} value={b.code}>{b.code}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {sentSauces.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-gray-900 mb-2">Sauces - untick any that didn't come</p>
              <div className="flex flex-wrap gap-2">
                {sentSauces.map((s) => {
                  const missing = saucesMissing.includes(s);
                  return (
                    <label key={s} className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-sm ${missing ? 'border-red-300 bg-red-50 text-red-700' : 'border-gray-200'}`}>
                      <input type="checkbox" checked={!missing} onChange={(e) => setSaucesMissing((prev) => e.target.checked ? prev.filter((x) => x !== s) : [...prev, s])} />
                      {s}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="rcv-boxes" className="block text-sm font-medium text-gray-700 mb-1">Boxes received{request.dispatch?.boxes ? ` (sent ${request.dispatch.boxes})` : ''}</label>
              <input id="rcv-boxes" type="number" inputMode="numeric" min={0} value={boxesReceived} onChange={(e) => setBoxesReceived(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div>
              <p className="block text-sm font-medium text-gray-700 mb-1">Momos hard frozen? *</p>
              <div className="flex gap-2" role="radiogroup" aria-label="Momos hard frozen">
                {[{ v: true, t: 'Yes, hard' }, { v: false, t: 'No, soft' }].map((o) => (
                  <button
                    key={o.t}
                    type="button"
                    role="radio"
                    aria-checked={hardFrozen === o.v}
                    onClick={() => setHardFrozen(o.v)}
                    className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium ${hardFrozen === o.v ? (o.v ? 'bg-green-600 text-white border-green-600' : 'bg-red-600 text-white border-red-600') : 'bg-white text-gray-700 border-gray-300'}`}
                  >
                    {o.t}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {hardFrozen === false && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">Don't refreeze soft momos - they weld into one block. Count them as damaged above, photograph them and call the production house.</p>
          )}

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Photos{needsPhoto ? ' *' : ' (if anything is wrong)'}</p>
            <div className="flex flex-wrap gap-2">
              {photos.map((p, i) => (
                <div key={i} className="relative">
                  <img src={p} alt={`Delivery photo ${i + 1}`} className="w-20 h-20 object-cover rounded-lg border" />
                  <button type="button" onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))} className="absolute -top-2 -right-2 bg-white border rounded-full p-0.5" aria-label="Remove photo"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              {photos.length < 4 && (
                <label className="w-20 h-20 flex flex-col items-center justify-center gap-1 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 text-xs cursor-pointer">
                  <Camera className="w-5 h-5" /> Add
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { addPhoto(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="rcv-notes" className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea id="rcv-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Box 2 lid was cracked" className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none" />
          </div>
        </div>

        <div className="p-4 bg-gray-50 border-t flex gap-3 rounded-b-xl">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg font-medium text-gray-700">Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg font-semibold disabled:opacity-60 inline-flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageCheck className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save count'}
          </button>
        </div>
      </div>
    </div>
  );
}

type SummaryProps = {
  request: ProductionRequest;
  products: Labels;
  accessToken: string;
};

// Sent vs counted for a received delivery, with the store's photos on demand.
export function ReceiptSummary({ request, products, accessToken }: SummaryProps) {
  const r = request.receipt;
  const [photos, setPhotos] = useState<{ id: string; dataUrl: string }[] | null>(null);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  if (!r) return null;

  const rows = products.filter(({ camelKey }) => r.lines[camelKey]);
  const problems = rows.some(({ camelKey }) => r.lines[camelKey].received !== r.lines[camelKey].shipped || r.lines[camelKey].damaged > 0)
    || (r.saucesMissing?.length || 0) > 0 || !r.hardFrozen;

  const loadPhotos = async () => {
    setLoadingPhotos(true);
    try {
      setPhotos(await api.getReceiptPhotos(accessToken, request.id));
    } catch {
      toast.error('Could not load photos');
    } finally {
      setLoadingPhotos(false);
    }
  };

  return (
    <div className={`mt-4 pt-4 border-t ${problems ? 'border-red-200' : 'border-gray-200'}`}>
      <p className={`text-xs font-semibold mb-2 ${problems ? 'text-red-700' : 'text-green-700'}`}>
        Counted at the store by {r.receivedByName} · {new Date(r.receivedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
        {problems ? ' · differences' : ' · all correct'}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="font-medium py-1 pr-2">Type</th>
              <th className="font-medium py-1 pr-2 text-right">Sent</th>
              <th className="font-medium py-1 pr-2 text-right">Counted</th>
              <th className="font-medium py-1 text-right">Damaged</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ camelKey, label }) => {
              const l = r.lines[camelKey];
              const short = l.received !== l.shipped;
              return (
                <tr key={camelKey} className="border-t border-gray-100">
                  <td className="py-1 pr-2 text-gray-800">{shortLabel(label)}</td>
                  <td className="py-1 pr-2 text-right">{l.shipped}</td>
                  <td className={`py-1 pr-2 text-right ${short ? 'text-red-700 font-semibold' : ''}`}>{l.received}</td>
                  <td className={`py-1 text-right ${l.damaged > 0 ? 'text-red-700 font-semibold' : 'text-gray-400'}`}>
                    {l.damaged > 0 ? `${l.damaged} ${RECEIPT_DAMAGE_REASONS.find((x) => x.id === l.damageReason)?.label.split(' ')[0].toLowerCase() || ''}${l.damageBatch ? ` · ${l.damageBatch}` : ''}` : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="text-[11px] text-gray-600 mt-2 space-y-0.5">
        {(r.saucesMissing?.length || 0) > 0 && <p className="text-red-700">Sauces missing: {r.saucesMissing!.join(', ')}</p>}
        <p>{r.hardFrozen ? 'Arrived hard frozen' : <span className="text-red-700 font-semibold">Arrived soft</span>}{r.boxesReceived != null ? ` · ${r.boxesReceived} box${r.boxesReceived === 1 ? '' : 'es'} received` : ''}</p>
        {r.notes && <p>Note: {r.notes}</p>}
      </div>
      {(r.photoIds?.length || 0) > 0 && (
        photos ? (
          <div className="flex flex-wrap gap-2 mt-2">
            {photos.map((p) => (
              <a key={p.id} href={p.dataUrl} target="_blank" rel="noopener noreferrer">
                <img src={p.dataUrl} alt="Delivery photo" className="w-20 h-20 object-cover rounded-lg border" />
              </a>
            ))}
          </div>
        ) : (
          <button type="button" onClick={loadPhotos} disabled={loadingPhotos} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-gray-700">
            {loadingPhotos ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />} {r.photoIds!.length} photo{r.photoIds!.length === 1 ? '' : 's'}
          </button>
        )
      )}
    </div>
  );
}
