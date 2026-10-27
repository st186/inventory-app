// Every request by day (store incharge: a period; production and managers: a day and status),
// and the managers' view across stores: where requests stand and the requests by momo type.
import * as React from 'react';
import { ArrowDown, ArrowUp, History, Inbox, Minus } from 'lucide-react';
import { Button } from '../ui/button';
import { FilterChips } from '../ui/chip';
import { EmptyState } from '../ui/empty-state';
import { Field } from '../ui/field';
import { NativeSelect } from '../ui/select';
import { ListGroup, ListRow } from '../ui/list-row';
import { Progress } from '../ui/progress';
import { StatGrid, StatTile } from '../ui/stat-tile';
import { StatusChip } from '../ui/status-chip';
import { useT } from '../../utils/i18n';
import { DatePicker } from '../DatePicker';
import type { StockRequestsVM } from './useStockRequests';
import type { StockFilterPreset } from './requestPeriods';
import { computeMomoTypeReport, totalsByType } from './stockMath';
import { CollapsibleCard, dayLabel, formatCount, momoName } from './stockShared';
import { RequestRow } from './ProductionQueue';

const DAYS_PAGE = 10;

export function AllRequests({ vm, defaultOpen = false }: { vm: StockRequestsVM; defaultOpen?: boolean }) {
  const { t, lang } = useT();
  const {
    isStoreIncharge, historyFilter, setHistoryFilter, historyCustomRange, setHistoryCustomRange, filterDate, setFilterDate, filterStatus,
    setFilterStatus, loadingOlderData, groupedByDate, sortedDates, finishedProducts, setSelectedRecentRequest, showFullHistory, setShowFullHistory,
  } = vm;
  const [daysShown, setDaysShown] = React.useState(DAYS_PAGE);
  const keys = finishedProducts.map((p) => p.camelKey);
  const periodOptions: { value: StockFilterPreset; label: string }[] = [
    { value: 'thisWeek', label: t('stock.period.thisWeek') },
    { value: 'lastWeek', label: t('stock.period.lastWeek') },
    { value: 'thisMonth', label: t('stock.period.thisMonth') },
    { value: 'lastMonth', label: t('stock.period.lastMonth') },
    { value: 'custom', label: t('stock.period.custom') },
  ];

  return (
    <CollapsibleCard
      open={showFullHistory || defaultOpen}
      onOpenChange={setShowFullHistory}
      icon={<span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-text-2 [&_svg]:size-5" aria-hidden="true"><History /></span>}
      title={t('stock.req.history')}
      subtitle={t('stock.req.historyHint')}
    >
      <div className="flex flex-col gap-4 p-4">
        {isStoreIncharge ? (
          <>
            <FilterChips aria-label={t('stock.period.label')} value={historyFilter} onValueChange={setHistoryFilter} options={periodOptions} className="-mx-4 px-4" />
            {historyFilter === 'custom' && (
              <div className="grid grid-cols-2 gap-3">
                <DatePicker label={t('date.from')} className="w-full" value={historyCustomRange.from} onChange={(date) => setHistoryCustomRange({ ...historyCustomRange, from: date })} />
                <DatePicker label={t('date.to')} className="w-full" value={historyCustomRange.to} onChange={(date) => setHistoryCustomRange({ ...historyCustomRange, to: date })} />
              </div>
            )}
          </>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <DatePicker label={t('stock.history.day')} className="w-full" value={filterDate} onChange={setFilterDate} />
            <Field label={t('stock.history.status')}>
              <NativeSelect value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="all">{t('stock.history.allStatuses')}</option>
                <option value="pending">{t('stock.status.new')}</option>
                <option value="accepted">{t('stock.status.accepted')}</option>
                <option value="in-preparation">{t('stock.status.packing')}</option>
                <option value="prepared">{t('status.packed')}</option>
                <option value="shipped">{t('status.onTheWay')}</option>
                <option value="delivered">{t('status.received')}</option>
              </NativeSelect>
            </Field>
            {(filterDate || filterStatus !== 'all') && (
              <Button variant="link" size="sm" className="justify-self-start" onClick={() => { setFilterDate(''); setFilterStatus('all'); }}>{t('stock.history.clear')}</Button>
            )}
          </div>
        )}
        {loadingOlderData && <p className="text-label text-text-3" role="status">{t('stock.history.loadingOlder')}</p>}

        {sortedDates.length === 0 ? (
          <EmptyState compact icon={Inbox} title={t('stock.req.noRequests')} body={t('stock.req.noRequestsBody')} />
        ) : (
          sortedDates.slice(0, daysShown).map((date) => {
            const dayRequests = groupedByDate[date];
            const totals = totalsByType(dayRequests, finishedProducts);
            const pieces = Object.values(totals).reduce((a, b) => a + b, 0);
            return (
              <ListGroup
                key={date}
                title={dayLabel(lang, date)}
                meta={`${t(dayRequests.length === 1 ? 'stock.queue.requestsCountOne' : 'stock.queue.requestsCount', { n: dayRequests.length })} · ${t('stock.pcs', { n: formatCount(pieces) })}`}
                footer={finishedProducts.filter(({ camelKey }) => totals[camelKey] > 0).map(({ camelKey, label }) => `${momoName(lang, camelKey, label)} ${formatCount(totals[camelKey])}`).join(' · ')}
              >
                {dayRequests.map((r) => (
                  <RequestRow key={r.id} request={r} keys={keys} showStore={!isStoreIncharge} onOpen={() => setSelectedRecentRequest(r)} />
                ))}
              </ListGroup>
            );
          })
        )}
        {sortedDates.length > daysShown && (
          <Button variant="secondary" onClick={() => setDaysShown((n) => n + DAYS_PAGE)}>{t('stock.queue.showMore', { n: sortedDates.length - daysShown })}</Button>
        )}
      </div>
    </CollapsibleCard>
  );
}

/** Managers: where requests stand (counts) and requests by momo type over a period. */
export function RequestOversight({ vm }: { vm: StockRequestsVM }) {
  const { lang } = useT();
  const { groupedByStatus, filteredRequests, canViewMomoTypeReport, requests, finishedProducts, chartTimeFilter, setChartTimeFilter, chartCustomRange, setChartCustomRange, loadingOlderData } = vm;
  const report = React.useMemo(
    () => computeMomoTypeReport({ requests, finishedProducts, filter: chartTimeFilter, customRange: chartCustomRange }),
    [requests, finishedProducts, chartTimeFilter, chartCustomRange],
  );
  const inProgress = groupedByStatus.accepted.length + groupedByStatus['in-preparation'].length + groupedByStatus.prepared.length + groupedByStatus.shipped.length + groupedByStatus.shippedPartial.length;
  const completed = groupedByStatus.delivered.length + groupedByStatus.deliveredPartial.length;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-2.5 text-subtitle font-semibold text-text">Where requests stand</h2>
        <StatGrid>
          <StatTile label="Waiting to be accepted" value={<span className="num">{groupedByStatus.pending.length}</span>} />
          <StatTile label="In progress" value={<span className="num">{inProgress}</span>} caption={groupedByStatus.shippedPartial.length ? `${groupedByStatus.shippedPartial.length} part sent` : undefined} />
          <StatTile label="Completed" value={<span className="num">{completed}</span>} caption={groupedByStatus.deliveredPartial.length ? `${groupedByStatus.deliveredPartial.length} part received` : undefined} />
          <StatTile label="All requests" value={<span className="num">{filteredRequests.length}</span>} />
        </StatGrid>
      </section>

      {canViewMomoTypeReport && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col">
            <h2 className="text-subtitle font-semibold text-text">Requests by momo type</h2>
            <span className="text-label text-text-3">{report.periodLabel} · {report.requestCount} requests · {report.comparisonLabel}</span>
          </div>
          <FilterChips
            aria-label="Period"
            value={chartTimeFilter}
            onValueChange={(v) => setChartTimeFilter(v)}
            className="-mx-4 px-4"
            options={[
              { value: 'today', label: 'Today' },
              { value: 'yesterday', label: 'Yesterday' },
              { value: 'thisWeek', label: 'This week' },
              { value: 'lastWeek', label: 'Last week' },
              { value: 'thisMonth', label: 'This month' },
              { value: 'lastMonth', label: 'Last month' },
              { value: 'custom', label: 'Custom' },
            ]}
          />
          {chartTimeFilter === 'custom' && (
            <div className="grid grid-cols-2 gap-3">
              <DatePicker label="From" className="w-full" value={chartCustomRange.from} onChange={(date) => setChartCustomRange({ ...chartCustomRange, from: date })} />
              <DatePicker label="To" className="w-full" value={chartCustomRange.to} onChange={(date) => setChartCustomRange({ ...chartCustomRange, to: date })} />
            </div>
          )}
          {loadingOlderData && <p className="text-label text-text-3" role="status">Loading older requests…</p>}
          <ListGroup
            empty={<EmptyState compact icon={Inbox} title={finishedProducts.length === 0 ? 'No momo types set up yet' : 'No stock requests in this period'} />}
          >
            {report.requestCount > 0 && report.lines.map((line) => (
              <div key={line.camelKey} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-body-md font-medium text-text">{momoName(lang, line.camelKey, line.label)}</span>
                    <span className="num text-label text-text-3">
                      Asked {formatCount(line.requested)} · delivered {formatCount(line.delivered)}
                      {line.comparison > 0 ? ` · ${report.comparisonLabel.replace(/^vs /, 'before: ')} ${formatCount(line.comparison)}` : ''}
                    </span>
                  </span>
                  {line.comparison > 0 && (
                    <StatusChip tone={line.direction === 'same' ? 'neutral' : line.direction === 'up' ? 'success' : 'danger'} icon={line.direction === 'up' ? ArrowUp : line.direction === 'down' ? ArrowDown : Minus}>
                      <span className="num">{Math.abs(line.percentChange).toFixed(0)}%</span>
                    </StatusChip>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Progress
                    value={line.fulfillmentPct === null ? 0 : Math.min(line.fulfillmentPct, 100)}
                    tone={line.fulfillmentPct === null ? 'primary' : line.fulfillmentPct >= 90 ? 'success' : line.fulfillmentPct >= 60 ? 'warning' : 'danger'}
                    aria-label={`Fulfilment ${line.fulfillmentPct ?? 0}%`}
                  />
                  <span className="num w-20 shrink-0 text-right text-label text-text-2">{line.fulfillmentPct === null ? '-' : `${line.fulfillmentPct}% sent`}</span>
                </div>
              </div>
            ))}
          </ListGroup>
        </section>
      )}
    </div>
  );
}

export { ListRow };
