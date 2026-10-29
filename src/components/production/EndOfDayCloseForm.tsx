import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Lock } from 'lucide-react';
import { Button } from '../ui/button';
import { Callout } from '../ui/callout';
import { EmptyState } from '../ui/empty-state';
import { Field } from '../ui/field';
import { Input } from '../ui/input';
import { useT } from '../../utils/i18n';
import { ALL_POOL_IDS, getPoolLabel } from '../../constants/momoTypes';
import type { LedgerDayContext, LeftoverReport, ProductionLedgerPoolState } from '../../utils/api';
import { toast } from '../ui/sonner';
import { looksLikeGrams } from './ledgerKg';
import { LeftoverReasons, LeftoverReportView, emptyLeftoverDraft, leftoverPayload, leftoverProblem, type LeftoverDraft } from './LeftoverReasons';

type Props = {
  pools: Record<string, ProductionLedgerPoolState>;
  // True only when this production house has never closed a ledger day before - the one
  // and only time a manual "what's physically on the shelf right now" opening override is
  // allowed, same escape hatch Production Cash uses for its own first day.
  isFirstEverDay: boolean;
  closed?: boolean;
  disabled?: boolean;
  submitting?: boolean;
  // Staff check-ins and machines for the leftover reasons, and the reasons already saved.
  dayContext?: LedgerDayContext | null;
  savedReport?: LeftoverReport | null;
  // Who closed the day and when ("Vijay Das, 30 Oct 1:23 am"), shown with "Day closed".
  closedBy?: string | null;
  // The owner looks without counting (owner, 29 Oct 2026: "what about todays leftover").
  readOnly?: boolean;
  onSubmit: (closingActuals: Record<string, number>, manualOpeningOverride?: Record<string, number>, wastageOverrides?: Record<string, number>, leftoverReport?: LeftoverReport) => void | Promise<void>;
};
const LEFTOVER_REASON_MIN_KG = 0.5; // the server says the same (minKg)

// The directly-reported leftover snapshot per pool - counted/weighed at day's end, not
// computed from a yield formula (confirmed requirement).
export function EndOfDayCloseForm({ pools, isFirstEverDay, closed, disabled, submitting, dayContext, savedReport, closedBy, readOnly, onSubmit }: Props) {
  const { t, lang } = useT();
  const [leftover, setLeftover] = useState<LeftoverDraft>(emptyLeftoverDraft);
  const [closingInputs, setClosingInputs] = useState<Record<string, string>>({});
  const [openingOverrideInputs, setOpeningOverrideInputs] = useState<Record<string, string>>({});
  // Wastage is never assumed - the starting-stock-minus-closing gap is only ever offered as
  // a one-click suggestion, never silently applied. Explicit per-pool state so "no value
  // entered yet" and "user confirmed 0" stay distinguishable.
  const [wastageInputs, setWastageInputs] = useState<Record<string, string>>({});

  // Only pools that actually have something to account for - either carried over from
  // yesterday or prepared today. A pool nobody touched (e.g. Paneer Stuffing on a day with
  // no paneer batches logged) is real clutter here, not useful information - confirmed
  // real complaint: the full always-9-or-16-row list buried the 2-3 rows that mattered.
  const relevantPoolIds = ALL_POOL_IDS.filter((id) => {
    const p = pools[id];
    return !!p && (p.opening > 0.005 || p.prepared > 0.005 || typeof p.closingActual === 'number');
  });

  // Re-seed from saved values whenever the underlying pools change (e.g. switching date,
  // or a fresh close having just been saved) - matches every other date-scoped form in
  // this app re-syncing local state off its loaded record.
  useEffect(() => {
    const seededClosing: Record<string, string> = {};
    const seededWastage: Record<string, string> = {};
    for (const id of ALL_POOL_IDS) {
      const pool = pools[id];
      seededClosing[id] = typeof pool?.closingActual === 'number' ? String(pool.closingActual) : '';
      seededWastage[id] = typeof pool?.wastage === 'number' ? String(pool.wastage) : '';
    }
    setClosingInputs(seededClosing);
    setWastageInputs(seededWastage);
  }, [pools]);

  const grams = [closingInputs, wastageInputs, openingOverrideInputs].some((inputs) => Object.values(inputs).some(looksLikeGrams));

  // Stuffing or coating left at the close: more than a little needs a reason (owner, 28 Oct 2026).
  const leftoverKg = relevantPoolIds
    .filter((id) => /^(stuffing|coating):/.test(id))
    .reduce((sum, id) => sum + Math.max(0, parseFloat(closingInputs[id] ?? '') || 0), 0);
  const needsReason = !closed && leftoverKg >= (dayContext?.minKg ?? LEFTOVER_REASON_MIN_KG);

  const handleSubmit = () => {
    if (grams) return;
    // Every item needs its count (0 when none is left): a blank one carried into tomorrow as if
    // none of it was used (29 Oct: dough, veg and cheese corn stuffing left blank).
    const uncounted = relevantPoolIds.filter((id) => (closingInputs[id] ?? '').trim() === '');
    if (uncounted.length) {
      toast.error(t('stock.prod.countEvery', { items: uncounted.map((id) => getPoolLabel(id)).join(', ') }));
      return;
    }
    const problem = needsReason ? leftoverProblem(leftover, t, dayContext || null) : null;
    if (problem) {
      toast.error(problem);
      return;
    }
    const closingActuals: Record<string, number> = {};
    for (const id of ALL_POOL_IDS) {
      const raw = closingInputs[id];
      if (raw !== undefined && raw !== '') closingActuals[id] = parseFloat(raw) || 0;
    }
    let manualOpeningOverride: Record<string, number> | undefined;
    if (isFirstEverDay) {
      manualOpeningOverride = {};
      for (const id of ALL_POOL_IDS) {
        const raw = openingOverrideInputs[id];
        if (raw !== undefined && raw !== '') manualOpeningOverride[id] = parseFloat(raw) || 0;
      }
    }
    const wastageOverrides: Record<string, number> = {};
    for (const id of ALL_POOL_IDS) {
      const raw = wastageInputs[id];
      if (raw !== undefined && raw !== '') wastageOverrides[id] = parseFloat(raw) || 0;
    }
    onSubmit(closingActuals, manualOpeningOverride, wastageOverrides, needsReason ? leftoverPayload(leftover, dayContext || null) : undefined);
  };

  if (readOnly && !closed) {
    return <p className="text-body-sm text-text-2" lang={lang}>{t('stock.prod.notCountedYet')}</p>;
  }

  return (
    <section className="flex flex-col gap-3" lang={lang}>
      {isFirstEverDay && !closed && <Callout tone="warning" icon={AlertTriangle} title={t('stock.prod.firstDay')} />}

      {relevantPoolIds.length === 0 ? (
        <EmptyState compact title={t('stock.prod.nothingYet')} />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface [&>*+*]:border-t [&>*+*]:border-border">
          {relevantPoolIds.map((id) => {
            const pool = pools[id] || { opening: 0, prepared: 0, closingActual: null, wastage: null };
            const closingRaw = closingInputs[id] ?? '';
            const closingValue = parseFloat(closingRaw);
            const effectiveOpening = isFirstEverDay && !closed
              ? (parseFloat(openingOverrideInputs[id] ?? '') || 0)
              : pool.opening;
            // Starting stock is always worked out: opening (whatever it is) plus today's prepared.
            const startingStock = effectiveOpening + pool.prepared;
            const suggestedWastage = closingRaw !== '' && !isNaN(closingValue) ? startingStock - closingValue : null;
            const wastageRaw = wastageInputs[id] ?? '';
            return (
              <div key={id} className="flex flex-col gap-3 px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-body-md font-medium text-text">{getPoolLabel(id)}</span>
                  <span className="num text-label text-text-3">
                    {t('stock.prod.preparedKg', { n: pool.prepared.toFixed(2) })} · <span className="font-semibold text-text">{t('stock.prod.startingKg', { n: startingStock.toFixed(2) })}</span>
                  </span>
                </div>
                <div className={`grid gap-3 ${isFirstEverDay && !closed ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  {isFirstEverDay && !closed && (
                    <Field label={t('stock.prod.alreadyThere')} error={looksLikeGrams(openingOverrideInputs[id]) ? t('stock.prod.looksLikeGrams') : undefined}>
                      <Input type="text" inputMode="decimal" className="num" value={openingOverrideInputs[id] ?? ''} onChange={(e) => setOpeningOverrideInputs((prev) => ({ ...prev, [id]: e.target.value.replace(/[^\d.]/g, '') }))} disabled={disabled} placeholder="0.00" />
                    </Field>
                  )}
                  <Field label={t('stock.prod.closingCount')} error={looksLikeGrams(closingRaw) ? t('stock.prod.looksLikeGrams') : undefined}>
                    <Input type="text" inputMode="decimal" className="num" value={closingRaw} onChange={(e) => setClosingInputs((prev) => ({ ...prev, [id]: e.target.value.replace(/[^\d.]/g, '') }))} disabled={disabled || closed} placeholder={closed ? t('stock.prod.notCounted') : '0.00'} />
                  </Field>
                  <Field label={t('stock.prod.wastageKg')} error={looksLikeGrams(wastageRaw) ? t('stock.prod.looksLikeGrams') : undefined}>
                    <Input type="text" inputMode="decimal" className="num" value={wastageRaw} onChange={(e) => setWastageInputs((prev) => ({ ...prev, [id]: e.target.value.replace(/[^\d.-]/g, '') }))} disabled={disabled || closed} placeholder="-" />
                  </Field>
                </div>
                {suggestedWastage !== null && wastageRaw === '' && !closed && (
                  <Button variant="link" size="sm" className="self-start" disabled={disabled} onClick={() => setWastageInputs((prev) => ({ ...prev, [id]: suggestedWastage.toFixed(2) }))}>
                    {t('stock.prod.useSuggestion', { n: suggestedWastage.toFixed(2) })}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {needsReason && <LeftoverReasons leftoverKg={leftoverKg} ctx={dayContext || null} value={leftover} onChange={setLeftover} disabled={disabled || submitting} />}
      {closed && savedReport?.reasons?.length ? <LeftoverReportView report={savedReport} /> : null}

      {!closed && !readOnly && relevantPoolIds.length > 0 && (
        <Button variant="secondary" className="self-start" leadingIcon={<Lock />} loading={submitting} disabled={disabled || grams} onClick={handleSubmit}>
          {t('stock.prod.closeDay')}
        </Button>
      )}
      {closed && <Callout tone="success" icon={CheckCircle2} title={t('stock.prod.dayClosed')}>{closedBy || undefined}</Callout>}
    </section>
  );
}
