import { useEffect, useMemo } from 'react';
import { Plus, X, Wand2 } from 'lucide-react';
import type { ProductionData } from '../../App';
import type { ProductionRequest } from '../../utils/api';
import { MOMO_TYPES } from '../../constants/momoTypes';
import { BatchAllocation, DispatchInfo, bagSize, bagsLabel, isPhase1Live } from '../../utils/batches';
import { getTodayIST } from '../../utils/timezone';

export interface DispatchDraft {
  batches: Record<string, BatchAllocation[]>;
  boxes: string;
  containerNumbers: string;
  packedBy: string;
  checkedBy: string;
}

export function emptyDispatchDraft(packedBy: string): DispatchDraft {
  return { batches: {}, boxes: '', containerNumbers: '', packedBy, checkedBy: '' };
}

export function buildDispatchInfo(draft: DispatchDraft, shippedQuantities: Record<string, number>, momoKeys: string[]): DispatchInfo {
  const bags: Record<string, number> = {};
  const batches: Record<string, BatchAllocation[]> = {};
  momoKeys.forEach((key) => {
    const shipped = shippedQuantities[key] || 0;
    if (shipped <= 0) return;
    bags[key] = Math.floor(shipped / bagSize(key));
    const list = (draft.batches[key] || []).filter((a) => a.code.trim() && a.pieces > 0).map((a) => ({ code: a.code.trim().toUpperCase(), pieces: a.pieces }));
    if (list.length > 0) batches[key] = list;
  });
  return {
    bags,
    batches,
    boxes: parseInt(draft.boxes, 10) || 0,
    containerNumbers: draft.containerNumbers.trim(),
    packedBy: draft.packedBy.trim(),
    checkedBy: draft.checkedBy.trim(),
  };
}

interface AvailableBatch {
  code: string;
  date: string;
  left: number;
}

// Batch-coded pieces still at the production house for one type: made in the last 10 days
// minus what earlier dispatches already took from each batch. Oldest first - the order to
// pick in (first in, first out).
function availableBatches(productionData: ProductionData[], requests: ProductionRequest[], inventoryKey: string, excludeRequestId: string): AvailableBatch[] {
  const momoType = MOMO_TYPES.find((t) => t.inventoryKey === inventoryKey);
  if (!momoType) return [];
  const since = new Date();
  since.setDate(since.getDate() - 10);
  const sinceStr = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(since.getDate()).padStart(2, '0')}`;
  const made = new Map<string, { date: string; pieces: number }>();
  productionData
    .filter((p) => p.date >= sinceStr)
    .forEach((p) => {
      (p.batches?.[momoType.key] || []).forEach((b) => {
        if (!b.code || b.pieces <= 0) return;
        const prev = made.get(b.code);
        made.set(b.code, { date: prev?.date && prev.date < p.date ? prev.date : p.date, pieces: (prev?.pieces || 0) + b.pieces });
      });
    });
  const taken = new Map<string, number>();
  requests
    .filter((r) => r.id !== excludeRequestId)
    .forEach((r) => (r.dispatch?.batches?.[inventoryKey] || []).forEach((a) => taken.set(a.code, (taken.get(a.code) || 0) + a.pieces)));
  return [...made.entries()]
    .map(([code, m]) => ({ code, date: m.date, left: m.pieces - (taken.get(code) || 0) }))
    .filter((b) => b.left > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code));
}

function allocateOldestFirst(pieces: number, available: AvailableBatch[]): BatchAllocation[] {
  const out: BatchAllocation[] = [];
  let remaining = pieces;
  for (const b of available) {
    if (remaining <= 0) break;
    const take = Math.min(b.left, remaining);
    out.push({ code: b.code, pieces: take });
    remaining -= take;
  }
  return out;
}

type Props = {
  request: ProductionRequest;
  momoKeys: string[];
  labels: Record<string, string>;
  shippedQuantities: Record<string, number>;
  setShippedQuantities: (next: Record<string, number>) => void;
  shippingNotes: Record<string, string>;
  setShippingNotes: (next: Record<string, string>) => void;
  draft: DispatchDraft;
  setDraft: (updater: (prev: DispatchDraft) => DispatchDraft) => void;
  productionData: ProductionData[];
  allRequests: ProductionRequest[];
};

// The momo part of "Mark as Shipped": quantities move in whole bags (50 chicken, 20 others),
// and each type lists the batches its bags come from, oldest batch suggested first.
export function ShipDialogBags({ request, momoKeys, labels, shippedQuantities, setShippedQuantities, shippingNotes, setShippingNotes, draft, setDraft, productionData, allRequests }: Props) {
  // Batch picking starts with Phase 1 go-live; before it only the quantities show.
  const live = isPhase1Live(getTodayIST());
  // Callers build momoKeys fresh on every render, so memo on its contents, not its identity.
  const momoKeySignature = momoKeys.join('|');
  const available = useMemo(() => {
    const out: Record<string, AvailableBatch[]> = {};
    momoKeys.forEach((key) => { out[key] = availableBatches(productionData, allRequests, key, request.id); });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [momoKeySignature, productionData, allRequests, request.id]);

  // Suggest batches oldest-first whenever a type's shipped count changes.
  const shippedSignature = momoKeys.map((k) => `${k}:${shippedQuantities[k] || 0}`).join('|');
  useEffect(() => {
    setDraft((prev) => {
      let changed = false;
      const batches = { ...prev.batches };
      momoKeys.forEach((key) => {
        const shipped = shippedQuantities[key] || 0;
        const current = batches[key] || [];
        const allocated = current.reduce((s, a) => s + a.pieces, 0);
        if (allocated !== shipped && available[key]?.length) {
          batches[key] = allocateOldestFirst(shipped, available[key]);
          changed = true;
        }
      });
      return changed ? { ...prev, batches } : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shippedSignature, available]);

  const setAllocations = (key: string, list: BatchAllocation[]) => setDraft((prev) => ({ ...prev, batches: { ...prev.batches, [key]: list } }));

  return (
    <div>
      <h3 className="font-bold text-lg text-gray-900 mb-1">Momos</h3>
      {live && <p className="text-sm text-gray-500 mb-3">Whole bags only: 50 chicken or 20 of the others, one batch per bag.</p>}
      <div className="space-y-3">
        {momoKeys.map((key) => {
          const requested = (request as any)[key] || 0;
          const shipped = shippedQuantities[key] || 0;
          const size = bagSize(key);
          const isDifferent = shipped !== requested;
          const allocations = draft.batches[key] || [];
          const allocated = allocations.reduce((s, a) => s + a.pieces, 0);
          const setShipped = (pieces: number) => setShippedQuantities({ ...shippedQuantities, [key]: Math.max(0, pieces) });
          return (
            <div key={key} className={`border rounded-lg p-4 ${isDifferent ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <p className="text-sm font-semibold text-gray-900">{labels[key] || key}</p>
                <p className="text-xs text-gray-500 text-right">Requested {requested} · {bagsLabel(requested, key)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setShipped(Math.ceil(shipped / size) * size - size)} className="w-10 h-10 flex-shrink-0 border-2 border-gray-300 rounded-lg font-bold text-gray-700" aria-label={`One bag less ${labels[key] || key}`}>−</button>
                <div className="flex-1 text-center">
                  <p className="text-lg font-bold text-gray-900 tabular-nums">{bagsLabel(shipped, key)}</p>
                  <p className="text-xs text-gray-500 tabular-nums">{shipped} pcs</p>
                </div>
                <button type="button" onClick={() => setShipped(Math.floor(shipped / size) * size + size)} className="w-10 h-10 flex-shrink-0 border-2 border-gray-300 rounded-lg font-bold text-gray-700" aria-label={`One bag more ${labels[key] || key}`}>+</button>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={shipped}
                  onChange={(e) => setShipped(parseInt(e.target.value, 10) || 0)}
                  aria-label={`${labels[key] || key} pieces shipped`}
                  className="w-20 px-2 py-2 border border-gray-300 rounded-lg text-right tabular-nums"
                />
              </div>
              {shipped % size !== 0 && shipped > 0 && (
                <p className="text-xs text-amber-700 mt-1">Includes a part bag of {shipped % size} - label it with the real count.</p>
              )}
              {isDifferent && (
                <div className="mt-2">
                  <label className="block text-sm font-medium text-amber-700 mb-1">Reason for difference *</label>
                  <input
                    type="text"
                    value={shippingNotes[key] || ''}
                    onChange={(e) => setShippingNotes({ ...shippingNotes, [key]: e.target.value })}
                    placeholder="e.g., Insufficient stock"
                    className="w-full px-3 py-2 border border-amber-300 rounded-lg bg-white"
                  />
                </div>
              )}
              {shipped > 0 && live && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-xs font-semibold text-gray-600">From batches</p>
                    {available[key]?.length > 0 && (
                      <button type="button" onClick={() => setAllocations(key, allocateOldestFirst(shipped, available[key]))} className="inline-flex items-center gap-1 text-xs font-medium text-orange-700">
                        <Wand2 className="w-3.5 h-3.5" /> Oldest first
                      </button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {allocations.map((a, i) => {
                      const left = available[key]?.find((b) => b.code === a.code)?.left;
                      return (
                        <div key={i} className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <input
                              type="text"
                              value={a.code}
                              onChange={(e) => setAllocations(key, allocations.map((x, j) => (j === i ? { ...x, code: e.target.value.toUpperCase() } : x)))}
                              placeholder="2510-CHK-B1"
                              list={`batches-${key}`}
                              aria-label="Batch code"
                              className="w-full px-2 py-1.5 text-sm font-mono border border-gray-300 rounded-lg"
                            />
                            {left !== undefined && <p className="text-[10px] text-gray-400 mt-0.5 pl-1">{left} pcs left in this batch</p>}
                          </div>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            value={a.pieces || ''}
                            onChange={(e) => setAllocations(key, allocations.map((x, j) => (j === i ? { ...x, pieces: Math.max(0, parseInt(e.target.value, 10) || 0) } : x)))}
                            aria-label={`Pieces from ${a.code || 'this batch'}`}
                            className="w-16 flex-shrink-0 px-2 py-1.5 text-sm text-right border border-gray-300 rounded-lg tabular-nums"
                          />
                          <button type="button" onClick={() => setAllocations(key, allocations.filter((_, j) => j !== i))} className="p-1.5 text-gray-500 hover:text-red-600 flex-shrink-0" aria-label="Remove batch">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <datalist id={`batches-${key}`}>
                    {(available[key] || []).map((b) => <option key={b.code} value={b.code}>{`${b.left} left`}</option>)}
                  </datalist>
                  <button type="button" onClick={() => setAllocations(key, [...allocations, { code: '', pieces: Math.max(0, shipped - allocated) }])} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-gray-700">
                    <Plus className="w-3.5 h-3.5" /> Add batch
                  </button>
                  {!available[key]?.length && allocations.length === 0 && (
                    <p className="text-xs text-gray-500 mt-1">No batch-coded production in the app for this type yet - type the codes from the bag labels.</p>
                  )}
                  {allocations.length > 0 && allocated !== shipped && (
                    <p className="text-xs text-amber-700 mt-1">Batches add up to {allocated} of {shipped} pcs.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type PackingProps = {
  draft: DispatchDraft;
  setDraft: (updater: (prev: DispatchDraft) => DispatchDraft) => void;
};

// Boxes and tubs on this trip and who packed and checked them - printed on the dispatch slip.
export function PackingFields({ draft, setDraft }: PackingProps) {
  const field = 'w-full px-3 py-2 border border-gray-300 rounded-lg';
  return (
    <div>
      <h3 className="font-bold text-lg text-gray-900 mb-3">Packing</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="pack-boxes" className="block text-sm font-medium text-gray-700 mb-1">Boxes on this trip *</label>
          <input id="pack-boxes" type="number" inputMode="numeric" min={1} value={draft.boxes} onChange={(e) => setDraft((p) => ({ ...p, boxes: e.target.value }))} placeholder="e.g. 2" className={field} />
        </div>
        <div>
          <label htmlFor="pack-numbers" className="block text-sm font-medium text-gray-700 mb-1">Box and tub numbers</label>
          <input id="pack-numbers" type="text" value={draft.containerNumbers} onChange={(e) => setDraft((p) => ({ ...p, containerNumbers: e.target.value }))} placeholder="e.g. Box 1-2, Tubs 1-6" className={field} />
        </div>
        <div>
          <label htmlFor="pack-by" className="block text-sm font-medium text-gray-700 mb-1">Packed by</label>
          <input id="pack-by" type="text" value={draft.packedBy} onChange={(e) => setDraft((p) => ({ ...p, packedBy: e.target.value }))} className={field} />
        </div>
        <div>
          <label htmlFor="pack-checked" className="block text-sm font-medium text-gray-700 mb-1">Checked by</label>
          <input id="pack-checked" type="text" value={draft.checkedBy} onChange={(e) => setDraft((p) => ({ ...p, checkedBy: e.target.value }))} placeholder="Second person who counted the bags" className={field} />
        </div>
      </div>
    </div>
  );
}
