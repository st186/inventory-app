import { useEffect, useMemo, useState } from 'react';
import { X, Trash2, Plus } from 'lucide-react';
import { toast } from './ui/sonner';
import { Button } from './ui/button';
import { Callout } from './ui/callout';
import { Field } from './ui/field';
import { IconButton } from './ui/icon-button';
import { Input } from './ui/input';
import { NativeSelect } from './ui/select';
import { ResponsiveModal } from './ui/responsive-modal';
import { SkeletonListRows } from './ui/skeleton';
import { Textarea } from './ui/textarea';
import { t as tSaved, useT } from '../utils/i18n';
import { KeyValue, momoName, reasonLabel } from './stock/stockShared';
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
  const { t, lang } = useT();
  const [open, setOpen] = useState(true);
  const [attempted, setAttempted] = useState(false);
  const [touched, setTouched] = useState(false);
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
        if (!cancelled) toast.error(tSaved('stock.wastage.loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [accessToken, storeId, date, finishedProducts, defaultType]);

  const updateLine = (id: number, patch: Partial<Line>) => {
    setTouched(true);
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };
  const dirty = touched;

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
      setAttempted(true);
      toast.error(tSaved('stock.wastage.reasonEach'));
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
      toast.success(tSaved('stock.wastage.saved', { date }));
      onClose();
    } catch (error) {
      console.error('Error saving stock wastage:', error);
      toast.error(tSaved('stock.wastage.failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(o) => { if (!o) setOpen(false); }}
      onClosed={onClose}
      dirty={dirty && !saving}
      title={t('stock.wastage.title')}
      description={t('stock.wastage.caption')}
      footer={
        <Button size="lg" className="flex-1" leadingIcon={<Trash2 />} loading={saving} disabled={loading} onClick={handleSave}>
          {t('stock.wastage.save')}
        </Button>
      }
    >
      <div className="flex flex-col gap-5" lang={lang}>
        <DatePicker label={t('stock.wastage.date')} className="w-full" value={date} onChange={setDate} max={todayISO()} />

        {loading ? (
          <SkeletonListRows count={2} leading="none" />
        ) : (
          <>
            <div className="flex flex-col gap-3">
              {lines.map((l, index) => {
                const needsReason = !l.reason && isPhase1Live(date);
                return (
                  <div key={l.id} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3">
                    <div className="flex items-end gap-2">
                      <Field label={t('stock.wastage.type')} className="flex-1">
                        <NativeSelect value={l.type} onChange={(e) => updateLine(l.id, { type: e.target.value })}>
                          {finishedProducts.map(({ camelKey, label }) => <option key={camelKey} value={camelKey}>{momoName(lang, camelKey, label)}</option>)}
                        </NativeSelect>
                      </Field>
                      <Field label={t('stock.wastage.pieces')} className="w-24">
                        <Input type="text" inputMode="numeric" value={l.qty} placeholder="0" onChange={(e) => updateLine(l.id, { qty: e.target.value.replace(/[^\d]/g, '') })} className="num text-right" />
                      </Field>
                      <IconButton label={t('stock.wastage.removeLine')} icon={<X />} onClick={() => setLines((prev) => prev.filter((x) => x.id !== l.id))} />
                    </div>
                    <Field label={t('stock.wastage.reason')} required={isPhase1Live(date)} error={needsReason && (parseInt(l.qty || '0', 10) || 0) > 0 && attempted ? t('stock.wastage.reasonEach') : undefined}>
                      <NativeSelect value={l.reason} onChange={(e) => updateLine(l.id, { reason: e.target.value })}>
                        <option value="">{l.qty && existingId ? t('stock.wastage.noReasonSaved') : t('stock.wastage.pickReason')}</option>
                        {STORE_REASONS.map((r) => <option key={r.code} value={r.code}>{r.code} · {reasonLabel(lang, 'waste', r.code, r.label)}</option>)}
                      </NativeSelect>
                    </Field>
                  </div>
                );
              })}
              <Button variant="secondary" leadingIcon={<Plus />} className="self-start" onClick={() => setLines((prev) => [...prev, newLine(defaultType)])}>
                {t('stock.wastage.addLine')}
              </Button>
            </div>

            <div className="rounded-lg border border-border bg-surface px-4 py-1.5">
              <KeyValue label={t('stock.wastage.total')} value={t('stock.pcs', { n: totals.waste })} />
              {totals.meals > 0 && <KeyValue label={t('stock.wastage.meals')} value={t('stock.pcs', { n: totals.meals })} />}
            </div>

            <Field label={t('stock.req.notes')} optional>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('stock.wastage.notesPlaceholder')} />
            </Field>

            {existingId && <Callout tone="warning" title={t('stock.wastage.overwrite')} />}
          </>
        )}
      </div>
    </ResponsiveModal>
  );
}
