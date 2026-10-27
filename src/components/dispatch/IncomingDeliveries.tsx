import { useEffect, useMemo, useState } from 'react';
import { FileText, PackageCheck, RefreshCw, Truck } from 'lucide-react';
import { toast } from '../ui/sonner';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/empty-state';
import { ErrorState } from '../ui/error-state';
import { IconButton } from '../ui/icon-button';
import { SkeletonListRows } from '../ui/skeleton';
import { StatusChip } from '../ui/status-chip';
import { t as tSaved, useT } from '../../utils/i18n';
import * as api from '../../utils/api';
import type { ProductionRequest } from '../../utils/api';
import { MOMO_TYPES } from '../../constants/momoTypes';
import { ReceiveDeliveryDialog, ReceiptSummary } from './ReceiveDeliveryDialog';
import { DispatchSlipModal } from './DispatchSlip';
import { StockPage, bagsText, dayLabel, momoName, timeLabel } from '../stock/stockShared';

type Props = {
  accessToken: string;
  storeId: string;
};

const PRODUCTS = MOMO_TYPES.map((t) => ({ camelKey: t.inventoryKey, label: `${t.label} Momo` }));

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// "Receive" for store crew: deliveries on the way to their store, each counted with the same
// receive sheet the store incharge uses, and the last few counts underneath.
export function IncomingDeliveries({ accessToken, storeId }: Props) {
  const { t, lang } = useT();
  const [requests, setRequests] = useState<ProductionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [receiving, setReceiving] = useState<ProductionRequest | null>(null);
  const [slip, setSlip] = useState<ProductionRequest | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const all = await api.fetchProductionRequests(accessToken, daysAgo(7));
      setRequests(all.filter((r) => r.storeId === storeId));
      setError(null);
    } catch (e: any) {
      setError(e?.message || tSaved('error.body'));
      toast.error(tSaved('stock.recv.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [accessToken, storeId]);

  const onTheWay = useMemo(() => requests.filter((r) => r.status === 'shipped' || r.status === 'partially-shipped'), [requests]);
  const received = useMemo(
    () => requests.filter((r) => r.receipt).sort((a, b) => (b.receipt!.receivedAt || '').localeCompare(a.receipt!.receivedAt || '')).slice(0, 5),
    [requests]
  );

  return (
    <StockPage lang={lang}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <h1 className="text-title font-semibold text-text">{t('stock.recv.title')}</h1>
          <p className="text-body-sm text-text-2">{t('stock.recv.caption')}</p>
        </div>
        <IconButton label={t('shell.refresh')} icon={<RefreshCw className={loading ? 'animate-spin' : undefined} />} disabled={loading} onClick={load} />
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="recv-on-the-way">
        <h2 id="recv-on-the-way" className="text-subtitle font-semibold text-text">{t('stock.recv.onTheWay')}</h2>
        {loading && requests.length === 0 ? (
          <SkeletonListRows count={2} />
        ) : error && requests.length === 0 ? (
          <ErrorState body={error} onRetry={load} retrying={loading} />
        ) : onTheWay.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface">
            <EmptyState compact icon={Truck} title={t('stock.recv.nothing')} body={t('stock.recv.nothingBody')} />
          </div>
        ) : (
          onTheWay.map((r, index) => {
            const lines = PRODUCTS.filter(({ camelKey }) => (r.shippedQuantities?.[camelKey] || 0) > 0);
            return (
              <article key={r.id} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-body-md font-semibold text-text">{t('stock.queue.forDay', { day: dayLabel(lang, r.requestDate) })}</span>
                    <span className="num text-label text-text-3">
                      {t('stock.recv.requestNo', { id: r.id.slice(0, 8).toUpperCase() })}
                      {r.shippedAt ? ` · ${t('stock.queue.leftAt', { time: timeLabel(r.shippedAt) })}` : ''}
                      {r.dispatch?.boxes ? ` · ${t('stock.slip.boxes', { n: r.dispatch.boxes })}` : ''}
                    </span>
                  </div>
                  <StatusChip status="request.onTheWay" />
                </div>
                <ul className="flex flex-col rounded-md bg-surface-2 px-3 py-1.5">
                  {lines.map(({ camelKey, label }) => (
                    <li key={camelKey} className="flex items-baseline justify-between gap-3 py-1 text-body-sm">
                      <span className="text-text">{momoName(lang, camelKey, label)}</span>
                      <span className="num font-semibold text-text">{bagsText(lang, r.shippedQuantities![camelKey], camelKey)}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2.5">
                  {r.dispatch && (
                    <Button variant="secondary" size="lg" leadingIcon={<FileText />} onClick={() => setSlip(r)}>{t('stock.slip.title')}</Button>
                  )}
                  <Button variant={index === 0 ? 'primary' : 'secondary'} size="lg" className="flex-1" leadingIcon={<PackageCheck />} onClick={() => setReceiving(r)}>{t('stock.req.receiveCount')}</Button>
                </div>
              </article>
            );
          })
        )}
      </section>

      {received.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-subtitle font-semibold text-text">{t('stock.recv.recent')}</h2>
          {received.map((r) => (
            <div key={r.id} className="flex flex-col gap-1">
              <span className="mx-1 text-label font-medium text-text-2">{t('stock.queue.forDay', { day: dayLabel(lang, r.requestDate) })} · {t('stock.recv.requestNo', { id: r.id.slice(0, 8).toUpperCase() })}</span>
              <ReceiptSummary request={r} products={PRODUCTS} accessToken={accessToken} />
            </div>
          ))}
        </section>
      )}

      {receiving && (
        <ReceiveDeliveryDialog
          request={receiving}
          products={PRODUCTS}
          accessToken={accessToken}
          onClose={() => setReceiving(null)}
          onReceived={async () => { setReceiving(null); await load(); }}
        />
      )}
      {slip && <DispatchSlipModal request={slip} products={PRODUCTS} onClose={() => setSlip(null)} />}
    </StockPage>
  );
}
