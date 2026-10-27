// Production -> Requests: the queue (To pack · Packed · Sent), one row per store or event
// stall request, and the momo totals asked for today. Tapping a row opens the request sheet
// (RequestSheet.tsx) with the next step: Accept -> Start packing -> Mark packed -> Ship.
import * as React from 'react';
import { CheckCircle2, Inbox, Store, Tent } from 'lucide-react';
import { Button } from '../ui/button';
import { FilterChips } from '../ui/chip';
import { EmptyState } from '../ui/empty-state';
import { ListGroup, ListRow } from '../ui/list-row';
import { StatusChip } from '../ui/status-chip';
import { useT } from '../../utils/i18n';
import type { ProductionRequest } from '../../utils/api';
import { getTodayIST } from '../../utils/timezone';
import type { StockRequestsVM } from './useStockRequests';
import { totalsByType } from './stockMath';
import { RequestStatusChip, dayLabel, formatCount, momoName, queueBucket, requestTotalPieces, timeLabel, type QueueBucket } from './stockShared';

const SENT_PAGE = 20;

export function RequestRow({ request, keys, onOpen, showStore = true }: { request: ProductionRequest; keys: string[]; onOpen: () => void; showStore?: boolean }) {
  const { t, lang } = useT();
  const isEvent = !!(request as any).eventId;
  const pieces = requestTotalPieces(request, keys);
  const sent = request.shippedAt ? t('stock.queue.leftAt', { time: timeLabel(request.shippedAt) }) : t('stock.queue.sentAtBy', { time: timeLabel(request.createdAt), name: request.requestedByName || request.requestedBy });
  return (
    <ListRow
      id={`request-${request.id}`}
      icon={isEvent ? Tent : Store}
      title={
        showStore ? (
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate">{request.storeName || t('stock.queue.unknownStore')}</span>
            {isEvent && <StatusChip tone="brand" size="sm">{t('event.event')}</StatusChip>}
          </span>
        ) : t('stock.queue.forDay', { day: dayLabel(lang, request.requestDate) })
      }
      subtitle={[showStore ? t('stock.queue.forDay', { day: dayLabel(lang, request.requestDate) }) : null, sent, t('stock.pcs', { n: formatCount(pieces) })].filter(Boolean).join(' · ')}
      trailing={<RequestStatusChip status={request.status} />}
      onClick={onOpen}
    />
  );
}

/** Pieces of each type asked for on today's requests. */
export function MomoTotalsToday({ vm }: { vm: StockRequestsVM }) {
  const { t, lang } = useT();
  const { requests, finishedProducts } = vm;
  const today = getTodayIST();
  const todays = requests.filter((r) => r.requestDate === today);
  const totals = totalsByType(todays, finishedProducts);
  const sum = Object.values(totals).reduce((a, b) => a + b, 0);
  return (
    <ListGroup
      title={t('stock.queue.totalsToday')}
      meta={todays.length ? t('stock.queue.requestsCount', { n: todays.length }) : undefined}
      empty={<EmptyState compact icon={Inbox} title={t('stock.queue.noneToday')} />}
      footer={sum > 0 ? <span className="num">{t('stock.detail.totalPieces', { n: formatCount(sum) })}</span> : undefined}
    >
      {sum > 0 && finishedProducts.filter(({ camelKey }) => (totals[camelKey] || 0) > 0).map(({ camelKey, label }) => (
        <ListRow key={camelKey} density="compact" title={momoName(lang, camelKey, label)} trailing={<span className="num text-body-md font-semibold text-text">{formatCount(totals[camelKey])}</span>} />
      ))}
    </ListGroup>
  );
}

export function ProductionQueue({ vm }: { vm: StockRequestsVM }) {
  const { t } = useT();
  const { requests, finishedProducts, queueFilter, setQueueFilter, setSelectedRecentRequest } = vm;
  const [sentShown, setSentShown] = React.useState(SENT_PAGE);
  const keys = finishedProducts.map((p) => p.camelKey);

  const buckets = React.useMemo(() => {
    const out: Record<QueueBucket, ProductionRequest[]> = { toPack: [], packed: [], sent: [] };
    requests.forEach((r) => out[queueBucket(r.status)].push(r));
    // Oldest first while there is work to do; the latest first once sent.
    const byDateAsc = (a: ProductionRequest, b: ProductionRequest) => a.requestDate.localeCompare(b.requestDate) || a.createdAt.localeCompare(b.createdAt);
    out.toPack.sort(byDateAsc);
    out.packed.sort(byDateAsc);
    out.sent.sort((a, b) => (b.shippedAt || b.requestDate).localeCompare(a.shippedAt || a.requestDate));
    return out;
  }, [requests]);

  const list = buckets[queueFilter];
  const shown = queueFilter === 'sent' ? list.slice(0, sentShown) : list;
  const emptyText = queueFilter === 'toPack' ? t('stock.queue.emptyToPack') : queueFilter === 'packed' ? t('stock.queue.emptyPacked') : t('stock.queue.emptySent');

  return (
    <section className="flex flex-col gap-3" aria-label={t('shell.requests')}>
      <FilterChips
        aria-label={t('stock.queue.filter')}
        value={queueFilter}
        onValueChange={(v) => setQueueFilter(v)}
        options={[
          { value: 'toPack', label: t('stock.queue.toPack'), count: buckets.toPack.length },
          { value: 'packed', label: t('status.packed'), count: buckets.packed.length },
          { value: 'sent', label: t('status.sent'), count: buckets.sent.length },
        ]}
      />
      <ListGroup empty={<EmptyState compact icon={CheckCircle2} title={t('empty.allCaughtUp')} body={emptyText} />}>
        {shown.map((r) => (
          <RequestRow key={r.id} request={r} keys={keys} onOpen={() => setSelectedRecentRequest(r)} />
        ))}
      </ListGroup>
      {queueFilter === 'sent' && list.length > sentShown && (
        <Button variant="secondary" onClick={() => setSentShown((n) => n + SENT_PAGE)}>{t('stock.queue.showMore', { n: list.length - sentShown })}</Button>
      )}
    </section>
  );
}
