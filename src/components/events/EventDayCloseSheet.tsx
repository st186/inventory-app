// The event's day close: what the stall sold (typed, with the stall's POS figures alongside when
// it has an outlet), plates per momo type, and the cash count against the event cash there should
// be. Assigned staff save it; the event incharge sends it. Saved through the events outbox, so a
// day close made with no signal goes when the signal is back.
import * as React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { ResponsiveModal } from '../ui/responsive-modal';
import { Field } from '../ui/field';
import { Button } from '../ui/button';
import { Money, MoneyInput, formatINR } from '../ui/money';
import { NumberStepper } from '../ui/number-stepper';
import { ListGroup, ListRow } from '../ui/list-row';
import { StatusChip } from '../ui/status-chip';
import { Callout } from '../ui/callout';
import { Textarea } from '../ui/textarea';
import { VoiceButton } from '../VoiceButton';
import { useT } from '../../utils/i18n';
import type { EventBundle, EventDayRow } from '../../utils/eventsApi';
import type { EventMomoKey } from '../../utils/eventRules';
import { MOMO_KEYS, momoLabel, shortDate, useEventsApi } from './eventsShared';

export function EventDayCloseSheet({ open, onOpenChange, bundle, row, onSaved }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bundle: EventBundle;
  row: EventDayRow;
  onSaved: () => void;
}) {
  const { t, lang } = useT();
  const api = useEventsApi();
  const ev = bundle.event;
  const account = bundle.digitalAccount;
  const day = row.day;
  const pos = day?.pos && day.pos.ok !== false ? day.pos : null;
  const start = () => ({
    cash: day?.manual?.cash ?? pos?.cash ?? null,
    digital: day?.manual?.digital ?? pos?.digital ?? null,
    online: day?.manual?.online ?? pos?.online ?? null,
    plates: { ...(day?.manual?.plates || {}) } as Partial<Record<EventMomoKey, number>>,
    counted: day?.cashCounted ?? null,
    notes: day?.manual?.notes || '',
  });
  const [form, setForm] = React.useState(start);
  const [busy, setBusy] = React.useState<'save' | 'send' | 'sync' | 'voice' | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => { if (open) { setForm(start()); setError(null); } }, [open, row.date]); // eslint-disable-line react-hooks/exhaustive-deps

  // Event cash there should be: the day's opening (last count + everything since), today's cash
  // movements other than sales (expenses paid in cash, top-ups, floats, handovers), plus the cash
  // sales typed here.
  const otherToday = bundle.cash.lines.filter((l) => l.date === row.date && l.kind !== 'sales');
  const otherSum = otherToday.reduce((s, l) => s + l.amount, 0);
  const expected = Math.round((row.openingCash + (form.cash || 0) + otherSum) * 100) / 100;
  const diff = form.counted == null ? null : Math.round((form.counted - expected) * 100) / 100;
  const submitted = !!day?.submitted;
  const canSend = bundle.permissions.canSubmitDay;
  const showOnline = (pos?.online || 0) > 0 || (day?.manual?.online || 0) > 0;
  const accountLabel = account.mode === 'separate' ? account.name : 'Paytm';

  const save = async (submit: boolean) => {
    setError(null);
    if (submit && form.counted == null) return setError(t('event.countCash'));
    setBusy(submit ? 'send' : 'save');
    try {
      const body = {
        cash: form.cash || 0, digital: form.digital || 0, online: form.online || 0, plates: form.plates,
        notes: form.notes, cashCounted: form.counted, submit,
      };
      const res = await api.submitDay(ev.id, ev.name, row.date, body);
      if (res.status === 'kept') toast.info(t('event.savedOnPhone'));
      else toast.success(submit ? t('event.dayCloseSent') : t('event.saveDraft'));
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message || 'Could not save');
    } finally {
      setBusy(null);
    }
  };

  const sync = async () => {
    setBusy('sync');
    try {
      const r = await api.posSync(ev.id, row.date);
      if (r.result?.ok === false) toast.error(r.result.error || 'POS sync failed');
      else toast.success(t('event.syncPos'));
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || 'POS sync failed');
    } finally {
      setBusy(null);
    }
  };

  const onVoice = async (text: string) => {
    setBusy('voice');
    try {
      const f = await api.voiceFill(text);
      setForm((x) => ({
        ...x,
        cash: f.cash ?? x.cash,
        digital: f.paytm ?? x.digital,
        counted: f.cashInHand ?? x.counted,
      }));
      if (f.unclear) toast.info(f.unclear);
    } catch (e: any) {
      toast.error(e?.message || 'Could not read that');
    } finally {
      setBusy(null);
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={`${t('event.dayClose')} · ${shortDate(row.date, lang)}`}
      description={ev.name}
      footer={(
        <div className="flex w-full flex-col gap-2">
          {!canSend && <span className="text-caption text-text-3">{t('event.onlyIncharge')}</span>}
          <div className="flex w-full gap-2">
            <Button variant="secondary" size="lg" className={canSend ? '' : 'flex-1'} loading={busy === 'save'} disabled={!!busy} onClick={() => save(false)}>{t('event.saveDraft')}</Button>
            {canSend && <Button size="lg" className="flex-1" loading={busy === 'send'} disabled={!!busy} onClick={() => save(true)}>{t('event.sendDayClose')}</Button>}
          </div>
        </div>
      )}
    >
      <div className="flex flex-col gap-4" lang={lang}>
        {error && <Callout tone="danger" title={error} live />}
        {submitted && (
          <Callout tone="success" title={t('event.dayCloseSent')}>
            {day?.submittedByName ? `${day.submittedByName}` : null}
          </Callout>
        )}

        {ev.ciferonStoreId && (
          <ListGroup
            title={t('event.posFigures')}
            action={bundle.permissions.canEnter ? <Button variant="secondary" size="sm" leadingIcon={<RefreshCw />} loading={busy === 'sync'} onClick={sync}>{t('event.syncPos')}</Button> : undefined}
          >
            {pos ? (
              <>
                <ListRow density="compact" title={t('event.cashSales')} amount={pos.cash} />
                <ListRow density="compact" title={t('event.digitalSales', { name: accountLabel })} amount={pos.digital} />
                {pos.online > 0 && <ListRow density="compact" title={t('event.onlineSales')} amount={pos.online} />}
                <ListRow density="compact" title={`${pos.orders} orders`} subtitle={pos.syncedAt ? new Date(pos.syncedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : undefined} />
              </>
            ) : (
              <ListRow density="compact" title={day?.posError || t('event.nothingYet')} icon={day?.posError ? AlertTriangle : undefined} iconTone="warning" />
            )}
          </ListGroup>
        )}

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-subtitle font-semibold">{t('event.salesToday')}</h2>
            <VoiceButton label={t('voice.speak')} busy={busy === 'voice'} onText={onVoice} />
          </div>
          <div className="flex flex-col gap-3.5 rounded-lg border border-border bg-surface p-4">
            <Field label={t('event.cashSales')}>
              <MoneyInput value={form.cash} onValueChange={(n) => setForm((x) => ({ ...x, cash: n }))} />
            </Field>
            <Field label={t('event.digitalSales', { name: accountLabel })} helper={account.mode === 'store_paytm' ? "Goes into the store's Paytm" : undefined}>
              <MoneyInput value={form.digital} onValueChange={(n) => setForm((x) => ({ ...x, digital: n }))} />
            </Field>
            {showOnline && (
              <Field label={t('event.onlineSales')}>
                <MoneyInput value={form.online} onValueChange={(n) => setForm((x) => ({ ...x, online: n }))} />
              </Field>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-subtitle font-semibold">{t('event.plates')}</h2>
          <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
            {MOMO_KEYS.map((k) => (
              <div key={k} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-body-md">{momoLabel(k, lang)}</span>
                <NumberStepper
                  label={momoLabel(k, lang)}
                  value={form.plates[k] || 0}
                  min={0}
                  max={5000}
                  editable
                  onChange={(v) => setForm((x) => ({ ...x, plates: { ...x.plates, [k]: v } }))}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-subtitle font-semibold">{t('event.countCash')}</h2>
          <ListGroup>
            <ListRow density="compact" title={t('event.cashOpening')} amount={row.openingCash} />
            <ListRow density="compact" title={t('event.cashSales')} amount={form.cash || 0} />
            {otherToday.map((l, i) => (
              <ListRow key={`${l.ref || l.label}-${i}`} density="compact" title={l.label} subtitle={l.kind === 'expense' ? t('event.cashExpenses') : t('event.cashTopups')} amount={l.amount} />
            ))}
            <ListRow density="compact" title={t('event.expectedCash')} trailing={<Money value={expected} className="text-title font-semibold" />} />
          </ListGroup>
          <Field label={t('event.cashCounted')}>
            <MoneyInput value={form.counted} onValueChange={(n) => setForm((x) => ({ ...x, counted: n }))} />
          </Field>
          {diff !== null && (
            <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3">
              <span className="text-body-md">{t('event.difference')}</span>
              {Math.abs(diff) < 1 ? <StatusChip status="dayClose.matched" />
                : diff < 0 ? <StatusChip tone="danger" icon={AlertTriangle}>{t('status.short', { amount: formatINR(Math.abs(diff)) })}</StatusChip>
                : <StatusChip tone="warning">{t('status.excess', { amount: formatINR(diff) })}</StatusChip>}
            </div>
          )}
        </section>

        <Field label={t('event.notes')} optional>
          <Textarea value={form.notes} maxLength={500} onChange={(e) => setForm((x) => ({ ...x, notes: e.target.value }))} />
        </Field>
      </div>
    </ResponsiveModal>
  );
}
