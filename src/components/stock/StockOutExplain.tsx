// Why each item was out of stock (owner, 1 Nov 2026: "for a day which items were not in stock and
// when they were stocked and send notification to the store manager explaining why it was out of
// stock"). At 11:45 PM the server lists the day's items switched off on Zomato and Swiggy, from when
// to when (onlineStock.ts, stock-out-day); the store incharge picks a reason for each here and the
// owner reads them on Home > Right now.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import * as api from '../../utils/api';
import { useT, type I18nKey } from '../../utils/i18n';
import { useRefreshSignal } from '../shell/refreshSignal';
import { timeOf } from '../home/HomeParts';
import { Button } from '../ui/button';
import { ChoiceChips } from '../ui/chip';
import { EmptyState } from '../ui/empty-state';
import { Field } from '../ui/field';
import { Input } from '../ui/input';
import { ResponsiveModal } from '../ui/responsive-modal';
import { toast } from '../ui/sonner';

// The same list as the server's EXPLAIN_REASONS (onlineStock.ts).
export const OUT_REASONS = ['sold_out', 'short_delivery', 'not_requested', 'ingredient', 'equipment', 'quality', 'busy', 'mistake', 'on_purpose', 'other'] as const;
type T = ReturnType<typeof useT>['t'];

export const reasonLabel = (t: T, reason: string) => t(`stock.soReason.${reason}` as I18nKey);

const dayOf = (iso: string) => {
  const d = new Date(Date.parse(iso) + 330 * 60000);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
};
export const dayWord = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** "7:02 pm to 9:15 pm", "from 7:02 pm, still off at closing", "since 31 Oct 7:02 pm, all day". */
export function periodText(t: T, p: api.OffPeriod, date: string): string {
  if (!p.from) return t('stock.oos.unknown');
  const before = Date.parse(p.from) < Date.parse(`${date}T00:00:00+05:30`);
  const since = `${dayOf(p.from)} ${timeOf(p.from)}`;
  if (!p.to) return before ? t('stock.oos.sinceAllDay', { since }) : t('stock.oos.fromStill', { from: timeOf(p.from) });
  return before ? t('stock.oos.sinceBack', { since, to: timeOf(p.to) }) : t('stock.oos.fromTo', { from: timeOf(p.from), to: timeOf(p.to) });
}

export function useStockOutsToExplain(enabled: boolean, accessToken?: string) {
  const [reports, setReports] = useState<api.OutOfStockDay[]>([]);
  const load = useCallback(() => {
    if (!enabled) return;
    api.getStockOutDaysToExplain(accessToken).then((r) => setReports(r.reports || [])).catch(() => undefined);
  }, [enabled, accessToken]);
  useEffect(() => { load(); }, [load]);
  useRefreshSignal(load);
  const waiting = useMemo(() => reports.flatMap((r) => r.items.filter((i) => !i.explanation).map((i) => ({ report: r, item: i }))), [reports]);
  return { reports, waiting, reload: load };
}

function ExplainItem({ report, item, accessToken, onSaved }: { report: api.OutOfStockDay; item: api.OutItem; accessToken?: string; onSaved: () => void }) {
  const { t } = useT();
  const [reason, setReason] = useState<string>(item.explanation?.reason || '');
  const [note, setNote] = useState(item.explanation?.note || '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!reason) return;
    if (reason === 'other' && !note.trim()) { toast.error(t('stock.oos.noteNeeded')); return; }
    setBusy(true);
    try {
      await api.explainStockOut({ storeId: report.storeId, date: report.date, productId: item.productId, reason, note: note.trim() || undefined }, accessToken);
      toast.success(t('stock.oos.saved'));
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save that');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3.5">
      <div className="flex flex-col gap-0.5">
        <span className="text-body-md font-semibold text-text">{item.name}</span>
        <span className="num text-label text-text-3">{item.periods.map((p) => periodText(t, p, report.date)).join(' · ')}</span>
      </div>
      <ChoiceChips
        wrap
        aria-label={t('stock.oos.title')}
        value={reason}
        onValueChange={setReason}
        options={OUT_REASONS.map((r) => ({ value: r, label: reasonLabel(t, r) }))}
      />
      <Field label={reason === 'other' ? t('stock.oos.noteNeeded') : t('stock.oos.note')} optional={reason !== 'other'}>
        <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      </Field>
      <div>
        <Button size="sm" leadingIcon={<CheckCircle2 />} loading={busy} disabled={!reason} onClick={save}>{t('stock.oos.save')}</Button>
      </div>
    </div>
  );
}

export function StockOutExplainSheet({ open, onOpenChange, reports, accessToken, onDone }: {
  open: boolean;
  accessToken?: string;
  onOpenChange: (open: boolean) => void;
  reports: api.OutOfStockDay[];
  onDone: () => void;
}) {
  const { t } = useT();
  const waiting = reports.filter((r) => r.items.some((i) => !i.explanation));
  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={t('stock.oos.title')} description={t('stock.oos.body')} size="detail">
      {waiting.length === 0 ? (
        <EmptyState compact icon={CheckCircle2} title={t('stock.oos.done')} />
      ) : (
        <div className="flex flex-col gap-5">
          {waiting.map((r) => (
            <section key={`${r.storeId}:${r.date}`} className="flex flex-col gap-3">
              <span className="text-label font-medium uppercase tracking-wide text-text-3">{dayWord(r.date)}{reports.some((x) => x.storeId !== r.storeId) ? ` · ${r.storeName}` : ''}</span>
              {r.items.filter((i) => !i.explanation).map((i) => <ExplainItem key={i.productId} report={r} item={i} accessToken={accessToken} onSaved={onDone} />)}
            </section>
          ))}
        </div>
      )}
    </ResponsiveModal>
  );
}
