// Deliveries the store still has to receive or confirm, in red at the top of the store incharge's
// Home until each is done (owner, 29 Oct 2026: two part-sent orders sat unreceived for days, so the
// store's stock was short by 1,713 momos). Two kinds:
//   - sent before today and not received: Received (the same step as the request's Receive button);
//   - marked received for the store by the owner or operations: Yes, it all came / Something was
//     missing (the owner and operations hear what).
// The reminder at 9:30 AM and 10 PM (server send-delivery-confirmation-reminders) opens Home.
import { useState } from 'react';
import { PackageCheck, Truck } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '../../utils/api';
import { useT } from '../../utils/i18n';
import { useShell } from '../shell/ShellContext';
import { Button } from '../ui/button';
import { Callout } from '../ui/callout';
import { promptText } from '../ui/confirm';
import { ResponsiveModal } from '../ui/responsive-modal';
import { istDate } from './homeFigures';
import { timeOf, useDateWords } from './HomeParts';

const ON_THE_WAY = ['shipped', 'partially-shipped'];
// Momos sent (shippedQuantities also holds sauces and utilities as utility_X / kitchenUtility_X).
const momosSent = (r: api.ProductionRequest) =>
  Object.entries(r.shippedQuantities || {}).reduce((s, [k, v]) => (/^(utility|kitchenUtility)_/.test(k) ? s : s + (Number(v) || 0)), 0);

export function deliveriesToCheck(requests: api.ProductionRequest[], today: string) {
  return requests
    .filter((r) => r.receiptConfirm?.pending || (ON_THE_WAY.includes(r.status) && !!r.shippedAt && (istDate(r.shippedAt) || '') < today))
    .sort((a, b) => a.requestDate.localeCompare(b.requestDate));
}

export function DeliveryChecksCard({ requests, today }: { requests: api.ProductionRequest[]; today: string }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const list = deliveriesToCheck(requests, today);
  if (!list.length) return null;
  return (
    <>
      <Callout tone="danger" icon={Truck} live onClick={() => setOpen(true)}
        title={list.length === 1 ? t('deliv.titleOne') : t('deliv.titleMany', { n: list.length })}>
        {t('deliv.body')}
      </Callout>
      {open && <DeliveryChecksSheet list={list} onClose={() => setOpen(false)} />}
    </>
  );
}

function DeliveryChecksSheet({ list, onClose }: { list: api.ProductionRequest[]; onClose: () => void }) {
  const { t } = useT();
  const { user, context, router } = useShell();
  const words = useDateWords();
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(() => new Set());
  const token = user.accessToken || '';
  const act = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    try {
      await fn();
      toast.success(t('deliv.thanks'));
      setDone((d) => new Set(d).add(id));
      void context.refreshData?.();
    } catch (e) {
      toast.error((e as Error).message || t('deliv.failed'));
    } finally {
      setBusy(null);
    }
  };
  const missing = async (r: api.ProductionRequest) => {
    const note = await promptText({
      title: t('deliv.missingTitle'), label: t('deliv.missingLabel'), placeholder: t('deliv.missingPlaceholder'),
      multiline: true, required: true, confirmLabel: t('deliv.missing'),
    });
    if (note) await act(r.id, () => api.confirmProductionReceipt(token, r.id, false, note));
  };
  const left = list.filter((r) => !done.has(r.id));
  return (
    <ResponsiveModal open={open} onOpenChange={(o) => !o && setOpen(false)} onClosed={onClose} size="detail" title={t('deliv.sheetTitle')} description={t('deliv.body')}>
      <div className="flex flex-col gap-3">
        {left.map((r) => {
          const sentOn = (r.shippedAt && istDate(r.shippedAt)) || '';
          const confirm = !!r.receiptConfirm?.pending;
          return (
            <div key={r.id} className="flex flex-col gap-2 rounded-lg border border-danger-border bg-surface p-3">
              <div className="flex items-start gap-2">
                {confirm ? <PackageCheck className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" /> : <Truck className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />}
                <div className="flex min-w-0 flex-col">
                  <span className="text-body-md font-semibold text-text">{t('deliv.order', { date: words.short(r.requestDate) })}</span>
                  <span className="text-body-sm text-text-2">
                    {confirm
                      ? t('deliv.markedFor', { name: r.receiptConfirm?.markedBy || '', n: momosSent(r), date: sentOn ? words.short(sentOn) : '' })
                      : t('deliv.notReceived', { date: sentOn ? words.short(sentOn) : '', time: r.shippedAt ? timeOf(r.shippedAt) : '', n: momosSent(r) })}
                  </span>
                </div>
              </div>
              {confirm ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" loading={busy === r.id} onClick={() => act(r.id, () => api.confirmProductionReceipt(token, r.id, true))}>{t('deliv.allCame')}</Button>
                  <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => missing(r)}>{t('deliv.missing')}</Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" loading={busy === r.id} onClick={() => act(r.id, () => api.updateProductionRequestStatus(token, r.id, r.status === 'partially-shipped' ? 'partially-delivered' : 'delivered', user.employeeId || user.name || ''))}>
                    {t('deliv.received')}
                  </Button>
                  <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => { setOpen(false); router.push('stock/requests'); }}>{t('deliv.details')}</Button>
                </div>
              )}
            </div>
          );
        })}
        {!left.length && <Callout tone="success" title={t('deliv.thanks')} />}
      </div>
    </ResponsiveModal>
  );
}
