import { useEffect, useMemo } from 'react';
import { Minus, Plus, X, Wand2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Field } from '../ui/field';
import { IconButton } from '../ui/icon-button';
import { Input } from '../ui/input';
import { useT } from '../../utils/i18n';
import { bagsText, momoName } from '../stock/stockShared';
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
  const { t, lang } = useT();
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
    <section className="flex flex-col gap-2">
      <h3 className="overline-label mx-1">{t('stock.ship.bagsTitle')}</h3>
      {live && <p className="mx-1 text-label text-text-3">{t('stock.ship.wholeBags')}</p>}
      <div className="overflow-hidden rounded-lg border border-border bg-surface [&>*+*]:border-t [&>*+*]:border-border">
        {momoKeys.map((key) => {
          const requested = (request as any)[key] || 0;
          const shipped = shippedQuantities[key] || 0;
          const size = bagSize(key);
          const isDifferent = shipped !== requested;
          const allocations = draft.batches[key] || [];
          const allocated = allocations.reduce((s, a) => s + a.pieces, 0);
          const name = momoName(lang, key, labels[key]);
          const setShipped = (pieces: number) => setShippedQuantities({ ...shippedQuantities, [key]: Math.max(0, pieces) });
          return (
            <div key={key} className="flex flex-col gap-3 px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-body-md font-medium text-text">{name}</span>
                <span className="num text-label text-text-3">{t('stock.ship.askedBags', { n: requested, bags: bagsText(lang, requested, key) })}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex flex-1 items-stretch overflow-hidden rounded-md border border-border-strong">
                  <IconButton label={t('common.less', { label: name })} icon={<Minus />} onClick={() => setShipped(Math.ceil(shipped / size) * size - size)} disabled={shipped <= 0} className="rounded-none" />
                  <div className="flex flex-1 flex-col items-center justify-center border-x border-border px-1 text-center">
                    <span className="num text-body-md font-semibold text-text">{bagsText(lang, shipped, key)}</span>
                    <span className="num text-caption text-text-3">{t('stock.pcs', { n: shipped })}</span>
                  </div>
                  <IconButton label={t('common.more', { label: name })} icon={<Plus />} onClick={() => setShipped(Math.floor(shipped / size) * size + size)} className="rounded-none" />
                </div>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={String(shipped)}
                  onChange={(e) => setShipped(parseInt(e.target.value.replace(/[^\d]/g, ''), 10) || 0)}
                  aria-label={`${name} · ${t('stock.pcsUnit')}`}
                  className="num w-20 text-right"
                />
              </div>
              {shipped % size !== 0 && shipped > 0 && <p className="text-label text-warning">{t('stock.ship.partBag', { n: shipped % size })}</p>}
              {isDifferent && (
                <Field label={t('stock.ship.reason')} required>
                  <Input value={shippingNotes[key] || ''} onChange={(e) => setShippingNotes({ ...shippingNotes, [key]: e.target.value })} placeholder={t('stock.ship.reasonPlaceholder')} />
                </Field>
              )}
              {shipped > 0 && live && (
                <div className="flex flex-col gap-2 rounded-md bg-surface-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-label font-medium text-text-2">{t('stock.ship.fromBatches')}</span>
                    {available[key]?.length > 0 && (
                      <Button variant="link" size="sm" leadingIcon={<Wand2 />} onClick={() => setAllocations(key, allocateOldestFirst(shipped, available[key]))}>{t('stock.ship.oldestFirst')}</Button>
                    )}
                  </div>
                  {allocations.map((a, i) => {
                    const left = available[key]?.find((b) => b.code === a.code)?.left;
                    return (
                      <div key={i} className="flex items-start gap-2">
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <Input
                            value={a.code}
                            onChange={(e) => setAllocations(key, allocations.map((x, j) => (j === i ? { ...x, code: e.target.value.toUpperCase() } : x)))}
                            placeholder="2510-CHK-B1"
                            list={`batches-${key}`}
                            aria-label={t('stock.ship.batchCode')}
                            className="font-mono"
                          />
                          {left !== undefined && <span className="num px-1 text-caption text-text-3">{t('stock.ship.leftInBatch', { n: left })}</span>}
                        </div>
                        <Input
                          type="text"
                          inputMode="numeric"
                          value={a.pieces ? String(a.pieces) : ''}
                          onChange={(e) => setAllocations(key, allocations.map((x, j) => (j === i ? { ...x, pieces: Math.max(0, parseInt(e.target.value.replace(/[^\d]/g, ''), 10) || 0) } : x)))}
                          aria-label={t('stock.prod.piecesIn', { code: a.code || '-' })}
                          className="num w-20 shrink-0 text-right"
                        />
                        <IconButton label={t('stock.ship.removeBatch')} icon={<X />} onClick={() => setAllocations(key, allocations.filter((_, j) => j !== i))} />
                      </div>
                    );
                  })}
                  <datalist id={`batches-${key}`}>
                    {(available[key] || []).map((b) => <option key={b.code} value={b.code}>{`${b.left} left`}</option>)}
                  </datalist>
                  <Button variant="ghost" size="sm" className="self-start" leadingIcon={<Plus />} onClick={() => setAllocations(key, [...allocations, { code: '', pieces: Math.max(0, shipped - allocated) }])}>
                    {t('stock.ship.addBatch')}
                  </Button>
                  {!available[key]?.length && allocations.length === 0 && <p className="text-label text-text-3">{t('stock.ship.noBatches')}</p>}
                  {allocations.length > 0 && allocated !== shipped && <p className="text-label text-warning">{t('stock.ship.batchesAddUp', { a: allocated, b: shipped })}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

type PackingProps = {
  draft: DispatchDraft;
  setDraft: (updater: (prev: DispatchDraft) => DispatchDraft) => void;
};

// Boxes and tubs on this trip and who packed and checked them - printed on the dispatch slip.
export function PackingFields({ draft, setDraft }: PackingProps) {
  const { t } = useT();
  return (
    <section className="flex flex-col gap-3">
      <h3 className="overline-label mx-1">{t('stock.ship.packing')}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('stock.ship.boxes')} required>
          <Input type="text" inputMode="numeric" value={draft.boxes} onChange={(e) => setDraft((p) => ({ ...p, boxes: e.target.value.replace(/[^\d]/g, '') }))} placeholder="2" />
        </Field>
        <Field label={t('stock.ship.boxNumbers')} optional>
          <Input value={draft.containerNumbers} onChange={(e) => setDraft((p) => ({ ...p, containerNumbers: e.target.value }))} placeholder="Box 1-2, Tubs 1-6" />
        </Field>
        <Field label={t('stock.ship.packedBy')}>
          <Input value={draft.packedBy} onChange={(e) => setDraft((p) => ({ ...p, packedBy: e.target.value }))} />
        </Field>
        <Field label={t('stock.ship.checkedBy')} helper={t('stock.ship.checkedByHint')}>
          <Input value={draft.checkedBy} onChange={(e) => setDraft((p) => ({ ...p, checkedBy: e.target.value }))} />
        </Field>
      </div>
    </section>
  );
}
