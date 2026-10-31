// "Right now" on the owner's Home (owner, 31 Oct 2026: "Build 1, 2 and 3"): the orders open in
// Ciferon at the moment, the ones open too long, and the closing check of orders that never became
// a bill or became a smaller one (server liveOrders.ts). The server looks every 3 minutes from
// 3 PM; a pull down looks again. Before 3 PM it shows last night's check.
import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Clock3, Radio, ReceiptText } from 'lucide-react';
import * as api from '../../utils/api';
import { useRefreshSignal } from '../shell/refreshSignal';
import { EmptyState } from '../ui/empty-state';
import { formatINR } from '../ui/money';
import { ResponsiveModal } from '../ui/responsive-modal';
import { StatusChip } from '../ui/status-chip';
import { timeOf } from './HomeParts';

const TYPE: Record<string, string> = { HomeDelivery: 'Online', TakeAway: 'Takeaway', DineIn: 'Dine-in' };
const typeWord = (type: string) => TYPE[type] || type;
const orderName = (o: { type: string; serial: string | null; table: string | null }) =>
  [typeWord(o.type), o.serial ? `#${o.serial}` : '', o.table ? `· table ${o.table}` : ''].filter(Boolean).join(' ');
const itemsLine = (items: api.LiveItem[], max = 3) => {
  const shown = items.slice(0, max).map((i) => `${i.qty || 1} ${i.name}`).join(', ');
  return items.length > max ? `${shown} +${items.length - max} more` : shown;
};
const minsWord = (m: number) => (m >= 90 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);
const RELOAD_AFTER_MS = 2 * 60 * 1000;

export function useLiveOrders(enabled: boolean, accessToken?: string) {
  const [data, setData] = useState<api.LiveOrdersNow | null>(null);
  const loadedAt = useRef(0);
  const load = useCallback((fresh = false) => {
    if (!enabled) return;
    loadedAt.current = Date.now();
    api.getLiveOrdersNow(fresh, accessToken).then(setData).catch(() => undefined);
  }, [enabled, accessToken]);
  useEffect(() => { load(); }, [load]);
  // A pull down looks at Ciferon again (the server does when its last look is over a minute old).
  useRefreshSignal(() => load(true));
  // Back on the app after a while: load again (no timer, to keep the free plan's calls down).
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible' && Date.now() - loadedAt.current > RELOAD_AFTER_MS) load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);
  return { data, reload: load };
}

function checkLine(s: NonNullable<api.LiveStoreNow['check']>['summary']): string {
  return [
    s.notBilled ? `${s.notBilled} never billed · ${formatINR(s.notBilledTotal)}` : '',
    s.billedLess ? `${s.billedLess} billed ${formatINR(s.lessBy)} less` : '',
    s.openAtClose ? `${s.openAtClose} still open · ${formatINR(s.openTotal)}` : '',
  ].filter(Boolean).join(' · ');
}

/** Before 3 PM there is only last night's check to show; with nothing in it, no card. */
export function liveCardShown(data: api.LiveOrdersNow | null): data is api.LiveOrdersNow {
  if (!data || !data.stores.length) return false;
  return data.open || data.stores.some((s) => s.orders.length || s.check);
}

export function LiveOrdersCard({ data }: { data: api.LiveOrdersNow | null }) {
  const [open, setOpen] = useState(false);
  if (!liveCardShown(data)) return null;
  const several = data.stores.length > 1;
  const orders = data.stores.flatMap((s) => s.orders.map((o) => ({ ...o, storeName: s.storeName })));
  const openTotal = data.stores.reduce((sum, s) => sum + s.openTotal, 0);
  const stuck = orders.filter((o) => o.stuck).length;
  const checks = data.stores.filter((s) => s.check).map((s) => ({ storeName: s.storeName, check: s.check! }));
  const findings = checks.reduce((n, c) => n + c.check.findings.length, 0);
  const lastPoll = data.stores.map((s) => s.lastPoll).filter(Boolean).sort().pop() || null;
  const unreachable = data.open && data.stores.every((s) => s.error);
  const checkWord = (date: string) => (date === data.date ? "Tonight's check" : "Last night's check");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full flex-col gap-3 rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <Radio className={`mt-0.5 size-5 shrink-0 ${data.open ? 'text-success' : 'text-text-3'}`} aria-hidden="true" />
            <div className="flex min-w-0 flex-col">
              <span className="text-body-md font-semibold text-text">Right now</span>
              <span className="text-label text-text-3">
                {data.open ? (lastPoll ? `Open orders in Ciferon · checked ${timeOf(lastPoll)}` : 'Open orders in Ciferon') : 'Store closed · opens 3 PM'}
              </span>
            </div>
          </div>
          {data.open && (stuck
            ? <StatusChip tone="danger" icon={Clock3} size="sm">{stuck} waiting long</StatusChip>
            : <StatusChip tone={orders.length ? 'info' : 'neutral'} size="sm">{orders.length} open</StatusChip>)}
        </div>

        {data.open && !unreachable && (orders.length === 0 ? (
          <span className="text-body-sm text-text-2">No open orders.</span>
        ) : (
          <div className="flex flex-col gap-2">
            <span className="num text-body-sm text-text-2">{formatINR(openTotal)} still to be billed</span>
            <ul className="flex flex-col divide-y divide-border">
              {orders.slice(0, 4).map((o) => (
                <li key={`${o.storeName}:${o.key}`} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-body-sm font-medium text-text">{several ? `${o.storeName} · ` : ''}{orderName(o)}</span>
                    {o.items.length > 0 && <span className="truncate text-label text-text-3">{itemsLine(o.items, 2)}</span>}
                  </div>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="num text-body-sm text-text">{formatINR(o.total)}</span>
                    {o.stuck || o.old
                      ? <StatusChip tone="danger" size="sm">{o.old ? 'from an earlier day' : minsWord(o.ageMin)}</StatusChip>
                      : <span className="num text-label text-text-3">{minsWord(o.ageMin)}</span>}
                  </span>
                </li>
              ))}
            </ul>
            {orders.length > 4 && <span className="text-label font-medium text-primary">See all {orders.length}</span>}
          </div>
        ))}
        {unreachable && <span className="text-body-sm text-danger">Couldn't reach Ciferon. The next try is within 3 minutes.</span>}

        {checks.map(({ storeName, check }) => (
          <div key={storeName} className={`flex items-start gap-2 rounded-md p-2.5 ${check.findings.length ? 'bg-warning-soft' : 'bg-success-soft'}`}>
            {check.findings.length
              ? <ReceiptText className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
              : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />}
            <span className="text-body-sm text-text">
              <span className="font-medium">{checkWord(check.date)}{several ? ` · ${storeName}` : ''}:</span>{' '}
              {check.findings.length ? checkLine(check.summary) : `all ${check.seen} orders seen were billed`}
            </span>
          </div>
        ))}
      </button>

      <ResponsiveModal
        open={open}
        onOpenChange={setOpen}
        title="Right now"
        description="Orders open in Ciferon, and the 11:45 PM check of every order seen open against the day's bills."
        size="detail"
      >
        <div className="flex flex-col gap-5">
          {data.stores.map((s) => (
            <section key={s.storeId} className="flex flex-col gap-3">
              {several && <h3 className="text-body-md font-semibold text-text">{s.storeName}</h3>}
              <div className="flex flex-col gap-2">
                <span className="text-label font-medium uppercase tracking-wide text-text-3">Open now{s.lastPoll ? ` · checked ${timeOf(s.lastPoll)}` : ''}</span>
                {s.error && data.open && <span className="text-body-sm text-danger">Couldn't reach Ciferon: {s.error}</span>}
                {s.orders.length === 0 ? (
                  <span className="text-body-sm text-text-2">{data.open ? 'No open orders.' : 'The store is closed.'}</span>
                ) : s.orders.map((o) => (
                  <div key={o.key} className="flex flex-col gap-1 rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-body-sm font-semibold text-text">{orderName(o)}</span>
                      <span className="num text-body-sm font-medium text-text">{formatINR(o.total)}</span>
                    </div>
                    <span className="num text-label text-text-3">
                      {o.placedAt ? `placed ${timeOf(o.placedAt)} · ` : ''}open {minsWord(o.ageMin)}
                      {o.stuck ? ' · waiting long' : ''}{o.old ? ' · from an earlier day' : ''}
                    </span>
                    {o.items.length > 0 && <span className="text-body-sm text-text-2">{itemsLine(o.items, 8)}</span>}
                  </div>
                ))}
              </div>
              {s.check && (
                <div className="flex flex-col gap-2">
                  <span className="text-label font-medium uppercase tracking-wide text-text-3">
                    {checkWord(s.check.date)} · {s.check.seen} orders seen, {s.check.matched} matched to a bill
                  </span>
                  {s.check.findings.length === 0 ? (
                    <EmptyState compact icon={CheckCircle2} title="Every order was billed" body="Each order seen open became a bill for the full amount." />
                  ) : s.check.findings.map((f) => (
                    <div key={f.key} className="flex flex-col gap-1 rounded-lg border border-border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-body-sm font-semibold text-text">{orderName(f)}</span>
                        <StatusChip tone={f.kind === 'billed_less' ? 'warning' : 'danger'} size="sm">
                          {f.kind === 'not_billed' ? (f.type === 'HomeDelivery' ? 'Cancelled or not billed' : 'Never billed')
                            : f.kind === 'billed_less' ? `Billed ${formatINR(f.total - (f.billed || 0))} less` : 'Still open'}
                        </StatusChip>
                      </div>
                      <span className="num text-label text-text-3">
                        {f.kind === 'billed_less' ? `came to ${formatINR(f.total)}, billed ${formatINR(f.billed || 0)}` : formatINR(f.total)}
                        {' · '}seen open {timeOf(f.firstSeen)}–{timeOf(f.lastSeen)}
                      </span>
                      {f.items.length > 0 && <span className="text-body-sm text-text-2">{itemsLine(f.items, 8)}</span>}
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      </ResponsiveModal>
    </>
  );
}
