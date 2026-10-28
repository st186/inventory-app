// Leftover momos: per momo type, pieces going back to the production house and pieces wasted
// (with a reason). At the end of the event, or any day for a partial return. Both leave the
// stall's stock at once; production counts the returned ones in when they arrive.
import * as React from 'react';
import { toast } from 'sonner';
import { ResponsiveModal } from '../ui/responsive-modal';
import { NumberStepper } from '../ui/number-stepper';
import { Field } from '../ui/field';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { ChoiceChips } from '../ui/chip';
import { Callout } from '../ui/callout';
import { useT, type I18nKey } from '../../utils/i18n';
import type { EventBundle } from '../../utils/eventsApi';
import type { EventMomoKey } from '../../utils/eventRules';
import { MOMO_KEYS, localNum, momoLabel, useEventsApi } from './eventsShared';

const REASONS = ['thawed', 'damaged', 'tooLong', 'other'] as const;
type Reason = typeof REASONS[number];

export function EventLeftoverSheet({ open, onOpenChange, bundle, onDone }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bundle: EventBundle;
  onDone: () => void;
}) {
  const { t, lang } = useT();
  const api = useEventsApi();
  const ev = bundle.event;
  const stock = bundle.stock.momos;
  const keys = MOMO_KEYS.filter((k) => (stock[k]?.left || 0) > 0);
  const [back, setBack] = React.useState<Partial<Record<EventMomoKey, number>>>({});
  const [waste, setWaste] = React.useState<Partial<Record<EventMomoKey, number>>>({});
  const [reason, setReason] = React.useState<Reason>('thawed');
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // At the end of the event everything left goes back by default; on a normal day nothing.
  const endOfEvent = bundle.today >= ev.endDate;
  React.useEffect(() => {
    if (!open) return;
    const all: Partial<Record<EventMomoKey, number>> = {};
    if (endOfEvent) for (const k of keys) all[k] = stock[k].left;
    setBack(all);
    setWaste({});
    setReason('thawed');
    setNote('');
    setError(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalBack = keys.reduce((s, k) => s + (back[k] || 0), 0);
  const totalWaste = keys.reduce((s, k) => s + (waste[k] || 0), 0);

  const save = async () => {
    setError(null);
    if (!totalBack && !totalWaste) return setError(t('event.leftoverHint'));
    setBusy(true);
    try {
      await api.returnMomos(ev.id, {
        returned: back, wasted: waste, wasteReason: totalWaste ? t(reason === 'other' ? 'event.cat.other' : `event.reason.${reason}` as I18nKey) : undefined, note: note.trim(),
      });
      toast.success(t('event.leftoverSaved'));
      onDone();
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message || 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('event.leftover')}
      description={bundle.productionHouse ? `${t('event.backToProduction')}: ${bundle.productionHouse.name}` : undefined}
      dirty={(totalBack > 0 || totalWaste > 0) && !busy && !endOfEvent}
      footer={<Button size="lg" className="w-full" loading={busy} onClick={save}>{t('common.save')}</Button>}
    >
      <div className="flex flex-col gap-4" lang={lang}>
        {error && <Callout tone="danger" title={error} live />}
        <p className="text-body-sm text-text-2">{t('event.leftoverHint')}</p>
        {keys.length === 0 && <Callout tone="neutral" title={t('event.nothingYet')} />}
        {keys.map((k) => {
          const left = stock[k].left;
          const b = back[k] || 0;
          const w = waste[k] || 0;
          return (
            <div key={k} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-subtitle font-semibold">{momoLabel(k, lang)}</span>
                <span className="num text-label text-text-2">{t('event.atStallNow', { n: localNum(left, lang) })}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-body-md">{t('event.backToProduction')}</span>
                <NumberStepper label={`${momoLabel(k, lang)}: ${t('event.backToProduction')}`} value={b} min={0} max={Math.max(0, left - w)} step={1} editable onChange={(v) => setBack((x) => ({ ...x, [k]: v }))} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-body-md">{t('event.wastedPieces')}</span>
                <NumberStepper label={`${momoLabel(k, lang)}: ${t('event.wastedPieces')}`} value={w} min={0} max={Math.max(0, left - b)} step={1} editable onChange={(v) => setWaste((x) => ({ ...x, [k]: v }))} />
              </div>
            </div>
          );
        })}
        {totalWaste > 0 && (
          <Field label={t('event.wasteReason')} required>
            <ChoiceChips
              aria-label={t('event.wasteReason')}
              value={reason}
              onValueChange={setReason}
              options={REASONS.map((r) => ({ value: r, label: t(r === 'other' ? 'event.cat.other' : `event.reason.${r}` as I18nKey) }))}
            />
          </Field>
        )}
        <Field label={t('event.notes')} optional>
          <Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </ResponsiveModal>
  );
}
