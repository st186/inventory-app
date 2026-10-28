// Production side: leftover momos coming back from event stalls. The production incharge counts
// them in ("Received back"); they then go back on the production house's stock. Renders nothing
// when nothing is on the way. Shown in the production queue (ProductionRequests.tsx).
import * as React from 'react';
import { Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { ListGroup, ListRow } from '../ui/list-row';
import { Button } from '../ui/button';
import { ResponsiveModal } from '../ui/responsive-modal';
import { NumberStepper } from '../ui/number-stepper';
import { Field } from '../ui/field';
import { Input } from '../ui/input';
import { Callout } from '../ui/callout';
import { useT } from '../../utils/i18n';
import type { EventMomoReturn } from '../../utils/eventsApi';
import type { EventMomoKey } from '../../utils/eventRules';
import { MOMO_KEYS, momoLabel, shortDate, useEventsApi, useLoad } from './eventsShared';

export function EventMomoReturnsCard({ onChanged }: { onChanged?: () => void }) {
  const { t, lang } = useT();
  const api = useEventsApi();
  const list = useLoad(() => api.momoReturns('sent'), []);
  const [open, setOpen] = React.useState<EventMomoReturn | null>(null);
  const rows = list.data || [];
  if (!rows.length) return null;

  return (
    <div lang={lang}>
      <ListGroup title={t('event.prodReturnsTitle')}>
        {rows.map((r) => (
          <ListRow
            key={r.id}
            icon={Undo2}
            iconTone="info"
            title={`${r.eventName || t('event.event')} · ${r.returnedPieces} ${t('event.pieces')}`}
            subtitle={[shortDate(r.date, lang), MOMO_KEYS.filter((k) => r.returned?.[k]).map((k) => `${momoLabel(k, lang)} ${r.returned[k]}`).join(' · ')].join(' · ')}
            trailing={<Button size="sm" onClick={() => setOpen(r)}>{t('event.receivedBack')}</Button>}
          />
        ))}
      </ListGroup>
      <ReceiveBackSheet item={open} onClose={() => setOpen(null)} onDone={() => { list.reload(); onChanged?.(); }} />
    </div>
  );
}

function ReceiveBackSheet({ item, onClose, onDone }: { item: EventMomoReturn | null; onClose: () => void; onDone: () => void }) {
  const { t, lang } = useT();
  const api = useEventsApi();
  const [counts, setCounts] = React.useState<Partial<Record<EventMomoKey, number>>>({});
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => { if (item) { setCounts({ ...item.returned }); setNote(''); setError(null); } }, [item]);
  const keys = MOMO_KEYS.filter((k) => item?.returned?.[k]);
  const short = keys.reduce((s, k) => s + Math.max(0, (item?.returned?.[k] || 0) - (counts[k] || 0)), 0);

  const save = async () => {
    if (!item) return;
    setBusy(true);
    setError(null);
    try {
      await api.receiveMomoReturn(item.eventId, item.id, counts, note.trim());
      toast.success(t('event.returnReceived'));
      onDone();
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ResponsiveModal
      open={!!item}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={t('event.countBack')}
      description={item ? `${item.eventName || ''} · ${shortDate(item.date, lang)}` : undefined}
      footer={<Button size="lg" className="w-full" loading={busy} onClick={save}>{t('event.receivedBack')}</Button>}
    >
      <div className="flex flex-col gap-4" lang={lang}>
        {error && <Callout tone="danger" title={error} live />}
        {keys.map((k) => (
          <div key={k} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3">
            <div className="flex flex-col">
              <span className="text-body-md">{momoLabel(k, lang)}</span>
              <span className="num text-caption text-text-3">{`${item?.returned?.[k] || 0} ${t('event.pieces')}`}</span>
            </div>
            <NumberStepper label={momoLabel(k, lang)} value={counts[k] || 0} min={0} max={item?.returned?.[k] || 0} editable onChange={(v) => setCounts((c) => ({ ...c, [k]: v }))} />
          </div>
        ))}
        {short > 0 && <Callout tone="warning" title={`${short} ${t('event.pieces')} short`}>The event is told; the missing pieces stay on its costs.</Callout>}
        <Field label={t('event.notes')} optional><Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </ResponsiveModal>
  );
}
