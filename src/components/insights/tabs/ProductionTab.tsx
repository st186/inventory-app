// Insights > Production: what the production house made in the period picked in the Insights
// period chip. Template: headline (pieces made, change vs the period before) -> one daily chart
// -> mix by momo type (share bars, never a pie) -> by-type list; then yield and wastage rate,
// sauces, weekday pattern, stock at the house, houses compared, the ledger, wastage and the SOP
// check, each as a chart or a list. The figures come from parts/production/productionCalc.ts,
// moved there unchanged from the old render body.
import { useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Calendar, CheckCircle2, Clock, Package, Pencil, Settings, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { formatDateIST } from '../../../utils/timezone';
import { useT } from '../../../utils/i18n';
import { Button } from '../../ui/button';
import { Callout } from '../../ui/callout';
import { Card } from '../../ui/card';
import { FilterChips } from '../../ui/chip';
import { DateStrip } from '../../ui/date-strip';
import { shortDateLabel, todayIST } from '../../ui/date-utils';
import { EmptyState } from '../../ui/empty-state';
import { Field, controlClasses } from '../../ui/field';
import { ListGroup, ListRow } from '../../ui/list-row';
import { formatNumberIN } from '../../ui/money';
import { ResponsiveModal } from '../../ui/responsive-modal';
import { SkeletonChart } from '../../ui/skeleton';
import { StatSplit, StatTile } from '../../ui/stat-tile';
import { StatusChip } from '../../ui/status-chip';
import { ShareBars } from '../../ui/chart-theme';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table';
import { cn } from '../../ui/utils';
import { type AnalyticsData, type WastageTimeFilter } from '../useAnalyticsData';
import { HowItWorks, MiniFigures, OverflowMenu, SectionHeading } from '../parts/common';
import {
  PRODUCTION_LEDGER_GO_LIVE_DATE,
  SOP_NAMES,
  buildLeaderboard,
  buildLedger,
  buildOutput,
  buildPeriodSummary,
  buildSauces,
  buildSopCompliance,
  buildStock,
  buildWastageBreakdown,
  buildWastageStatus,
  buildWastageTrend,
  buildWeekday,
  makeHouseMatcher,
  makeWastageMatcher,
} from '../parts/production/productionCalc';
import { CHART_COLORS, CHART_SERIES, ChartCard, ChartEmpty, TrendChart, deltaOf, legendFor, periodText, shortPrevLabel, type SeriesSpec } from './shared';

const fmt = (n: number) => formatNumberIN(n);
const kg = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString('en-IN')} kg`;

function ChangeChip({ change }: { change: number | null }) {
  if (change === null) return null;
  const up = change >= 0;
  return (
    <StatusChip tone={up ? 'success' : 'danger'} icon={up ? ArrowUp : ArrowDown}>
      <span className="num">{Math.abs(change).toFixed(1)}%</span>
    </StatusChip>
  );
}

const STOCK_LEVEL: Record<'over' | 'critical' | 'low' | 'medium', { tone: 'danger' | 'warning'; label: string }> = {
  over: { tone: 'danger', label: 'Over-sent' },
  critical: { tone: 'danger', label: 'Critical' },
  low: { tone: 'danger', label: 'Low' },
  medium: { tone: 'warning', label: 'Medium' },
};

export function ProductionTab({ d }: { d: AnalyticsData }) {
  const { t, lang } = useT();
  const {
    context, onNavigateToManageItems, isClusterHead, isProductionIncharge, isOperationsManager, analyticsMode, effectiveStoreId, wastageTimeFilter, setWastageTimeFilter,
    dateRange, setShowRecalibration, stores, latestRecalibration, previousMonthStock, sopThresholds, setSopThresholds, editingSop, setEditingSop, tempSopThresholds,
    setTempSopThresholds, sopDiversionPercent, setSopDiversionPercent, tempDiversionPercent, setTempDiversionPercent, stockAlertThresholds, setShowStockAlertModal,
    setTempStockAlertThresholds, momosPerPlate, setShowPlateSettingsModal, setTempMomosPerPlate, selectedProductionHouseId, setSelectedProductionHouseId, productionData,
    productionLedgerRange, productionLedgerRangeLoading, selectedLedgerPoolId, setSelectedLedgerPoolId, sopComplianceDate, setSopComplianceDate, getDateRangeBounds,
    getPreviousPeriodDateRange, zipPrev, pctChange,
  } = d;
  const prevLabel = shortPrevLabel(d, lang);
  const period = periodText(d, lang);

  const bounds = getDateRangeBounds();
  const previousBounds = getPreviousPeriodDateRange();
  const matches = makeHouseMatcher(selectedProductionHouseId, stores, context.stores);
  const summary = buildPeriodSummary(productionData, matches, bounds, previousBounds);
  const output = buildOutput(productionData, matches, bounds, previousBounds, zipPrev);
  const sauces = buildSauces(productionData, matches, bounds, previousBounds, zipPrev, pctChange);
  const weekday = buildWeekday(productionData, matches, bounds, previousBounds, zipPrev);
  const stock = buildStock({ productionData, selectedProductionHouseId, stores, context, previousMonthStock, stockAlertThresholds });
  const leaderboard = !selectedProductionHouseId && context.productionHouses && context.productionHouses.length > 1
    ? buildLeaderboard(productionData, context.productionHouses, stores, context.stores, bounds)
    : [];
  const ledger = selectedProductionHouseId && !productionLedgerRangeLoading
    ? buildLedger(productionLedgerRange, productionData, selectedProductionHouseId, selectedLedgerPoolId)
    : null;
  const wastageFilterId = analyticsMode === 'production'
    ? selectedProductionHouseId
    : (context.user?.designation === 'production_incharge' ? effectiveStoreId : selectedProductionHouseId);
  const wastageHelper = makeWastageMatcher(wastageFilterId, stores);
  const wastageStatus = buildWastageStatus(productionData, wastageHelper.matchesProductionHouse);
  const wastageTrend = buildWastageTrend(productionData, wastageHelper.matchesProductionHouse, bounds, previousBounds, zipPrev);
  const wastageBreakdown = buildWastageBreakdown(productionData, wastageHelper.matchesProductionHouse, wastageTimeFilter as WastageTimeFilter, dateRange);
  const sopRows = buildSopCompliance({
    productionData, stores, contextStores: context.stores, filterById: wastageFilterId, dateStr: sopComplianceDate, sopThresholds, sopDiversionPercent,
  });

  // Short x-axis dates on phones ("27 Oct") instead of the long IST format.
  const withShort = (rows: any[]) => rows.map((r) => ({ ...r, short: r.date ? shortDateLabel(r.date, lang) : r.label }));
  const outputData = withShort(output.outputChartData);
  const managesSettings = analyticsMode === 'production' && (isOperationsManager || isClusterHead);
  const [sopOpen, setSopOpen] = useState(false);

  const mainSeries: SeriesSpec[] = [
    { key: 'regularFinal', name: t('wp8.prod.momos'), color: CHART_SERIES[0], kind: 'bar', stack: 'made' },
    { key: 'kurkureFinal', name: t('wp8.prod.kurkure'), color: CHART_SERIES[1], kind: 'bar', stack: 'made' },
    { key: 'prev_totalFinal', name: t('insights.lastPeriod'), color: CHART_COLORS.previous, dashed: true },
  ];
  const mixItems = output.periodMix.filter((m) => m.value > 0).sort((a, b) => b.value - a.value);

  const openSopEditor = () => {
    setTempSopThresholds(JSON.parse(JSON.stringify(sopThresholds)));
    setTempDiversionPercent(sopDiversionPercent);
    setEditingSop(true);
    setSopOpen(true);
  };
  const cancelSop = () => {
    setEditingSop(false);
    setTempSopThresholds(null);
    setSopOpen(false);
  };
  const saveSop = () => {
    setSopThresholds(tempSopThresholds);
    setSopDiversionPercent(tempDiversionPercent);
    setEditingSop(false);
    // TODO: Save to backend
    toast.success('SOP thresholds and diversion limit updated successfully');
    setSopOpen(false);
  };

  return (
    <div className="flex flex-col gap-6" lang={lang}>
      {/* 1. Headline: pieces made this period */}
      <StatTile
        hero
        label={`${t('wp8.prod.made')} · ${period}`}
        value={fmt(summary.total)}
        delta={deltaOf(summary.total, summary.previousTotal, prevLabel)}
        chip={
          <>
            <StatusChip tone="success" icon={CheckCircle2}>{t('wp8.prod.approved', { n: summary.approvedCount })}</StatusChip>
            {summary.pendingCount > 0 && <StatusChip tone="warning" icon={Clock}>{t('wp8.prod.pending', { n: summary.pendingCount })}</StatusChip>}
          </>
        }
      >
        <StatSplit
          items={[
            { label: t('wp8.prod.momos'), value: fmt(summary.types.filter((x) => !x.key.includes('Kurkure')).reduce((s, x) => s + x.current, 0)) },
            { label: t('wp8.prod.kurkure'), value: fmt(summary.types.filter((x) => x.key.includes('Kurkure')).reduce((s, x) => s + x.current, 0)) },
            { label: t('wp8.prod.wastage'), value: `${summary.totalWastage.toFixed(2)} kg` },
          ]}
        />
      </StatTile>

      {/* 2. The one main chart: pieces made a day, last period dashed */}
      {output.currentDates.length > 0 && (
        <ChartCard title={t('wp8.prod.daily')} caption={period} legend={legendFor(mainSeries, t('insights.lastPeriod'))}>
          {output.hasAnyOutput ? (
            <TrendChart
              data={outputData}
              series={mainSeries}
              xKey="short"
              format="number"
              height={240}
              ariaLabel={`Pieces made a day, ${period}: ${fmt(summary.total)} in all`}
            />
          ) : (
            <ChartEmpty title={t('wp8.prod.empty')} />
          )}
        </ChartCard>
      )}

      {/* 3. Mix by momo type (share bars, not a pie) and the by-type list */}
      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <ChartCard title={t('wp8.prod.mix')} caption={period}>
          {mixItems.length > 0 ? (
            <ShareBars items={mixItems.map((m) => ({ label: m.name, value: m.value, color: CHART_COLORS.primary, valueText: `${fmt(m.value)} pcs` }))} />
          ) : (
            <ChartEmpty title={t('wp8.prod.empty')} />
          )}
        </ChartCard>
        <ListGroup title={t('wp8.prod.byType')} meta={prevLabel}>
          {summary.types.map((x) => (
            <ListRow
              key={x.key}
              title={x.label}
              subtitle={x.previous > 0 ? `${fmt(x.previous)} pcs the period before` : 'Nothing the period before'}
              trailing={
                <span className="flex flex-col items-end gap-1">
                  <span className="num text-body-md font-semibold text-text">{fmt(x.current)}</span>
                  <ChangeChip change={x.change} />
                </span>
              }
            />
          ))}
        </ListGroup>
      </div>

      {/* 4. Yield and wastage rate */}
      {output.currentDates.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
          <ChartCard
            title={t('wp8.prod.yield')}
            caption="Pieces made per kg of raw material · higher is better"
            legend={legendFor([
              { key: 'momoYield', name: 'Momos (pcs a kg)', color: CHART_SERIES[0] },
              { key: 'kurkureYield', name: 'Kurkure (pcs a kg)', color: CHART_SERIES[1] },
              { key: 'prev', name: '', color: CHART_COLORS.previous, dashed: true },
            ], t('insights.lastPeriod'))}
          >
            <TrendChart
              data={outputData}
              xKey="short"
              format="number"
              height={220}
              series={[
                { key: 'momoYield', name: 'Momos (pcs a kg)', color: CHART_SERIES[0] },
                { key: 'kurkureYield', name: 'Kurkure (pcs a kg)', color: CHART_SERIES[1] },
                { key: 'prev_momoYield', name: 'Momos, last period', color: CHART_COLORS.previous, dashed: true },
                { key: 'prev_kurkureYield', name: 'Kurkure, last period', color: CHART_COLORS.previous, dashed: true },
              ]}
              ariaLabel="Pieces made per kg of dough and stuffing (momos) or batter and coating (kurkure), a day"
            />
            <HowItWorks title={t('wp8.prod.yield')}>
              <p>Pieces produced for each kg of raw material used that day: dough plus stuffing for momos, batter plus coating for kurkure. Higher is more efficient.</p>
              <p>The dashed lines are the matching days of the period before.</p>
            </HowItWorks>
          </ChartCard>
          <ChartCard
            title={t('wp8.prod.wastageRate')}
            caption="Wasted raw material as a % of all raw material used · lower is better"
            legend={legendFor([
              { key: 'wastagePct', name: 'Wastage %', color: CHART_SERIES[0] },
              { key: 'prev', name: '', color: CHART_COLORS.previous, dashed: true },
            ], t('insights.lastPeriod'))}
          >
            <TrendChart
              data={outputData}
              xKey="short"
              format="percent"
              height={220}
              series={[
                { key: 'wastagePct', name: 'Wastage %', color: CHART_SERIES[0] },
                { key: 'prev_wastagePct', name: 'Wastage %, last period', color: CHART_COLORS.previous, dashed: true },
              ]}
              ariaLabel="Wastage as a percentage of raw material used, a day"
            />
          </ChartCard>
        </div>
      )}

      {/* 5. Sauces and chutneys */}
      {sauces.currentDates.length > 0 && sauces.hasAnySauce && (
        <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
          <ChartCard
            title={t('wp8.prod.sauces')}
            caption={`${(Math.round(sauces.totalLitres * 100) / 100).toLocaleString()} L prepared · ${period}`}
            legend={legendFor([
              { key: 'totalSauce', name: 'Litres prepared', color: CHART_SERIES[1], kind: 'bar' },
              { key: 'prev', name: '', color: CHART_COLORS.previous, dashed: true },
            ], t('insights.lastPeriod'))}
          >
            <TrendChart
              data={withShort(sauces.sauceChartData)}
              xKey="short"
              format={(v: number) => `${v} L`}
              height={200}
              series={[
                { key: 'totalSauce', name: 'Litres prepared', color: CHART_SERIES[1], kind: 'bar' },
                { key: 'prev_totalSauce', name: t('insights.lastPeriod'), color: CHART_COLORS.previous, dashed: true },
              ]}
              ariaLabel="Litres of sauces and chutneys prepared a day"
            />
          </ChartCard>
          <ListGroup title="By sauce" meta={prevLabel}>
            {sauces.rows.map((s) => (
              <ListRow
                key={s.key}
                density="compact"
                title={s.name}
                trailing={
                  <span className="flex items-center gap-2">
                    <span className="num text-body-md font-semibold text-text">{s.value.toLocaleString()} L</span>
                    {s.change !== null && (
                      <StatusChip tone={s.change >= 0 ? 'success' : 'danger'}>
                        <span className="num">{s.change >= 0 ? '+' : ''}{s.change.toFixed(0)}%</span>
                      </StatusChip>
                    )}
                  </span>
                }
              />
            ))}
          </ListGroup>
        </div>
      )}

      {/* 6. Day of the week */}
      {weekday.hasAnyOutput && (
        <ChartCard
          title={t('wp8.prod.weekday')}
          caption={`Pieces made on each weekday, added up over ${period.toLowerCase()}`}
          legend={legendFor([
            { key: 'totalFinal', name: t('wp8.prod.made'), color: CHART_SERIES[0], kind: 'bar' },
            { key: 'prev', name: '', color: CHART_COLORS.previous, dashed: true },
          ], t('insights.lastPeriod'))}
        >
          <TrendChart
            data={weekday.weekdayChartData}
            xKey="label"
            format="number"
            height={220}
            series={[
              { key: 'totalFinal', name: t('wp8.prod.made'), color: CHART_SERIES[0], kind: 'bar' },
              { key: 'prev_totalFinal', name: t('insights.lastPeriod'), color: CHART_COLORS.previous, dashed: true },
            ]}
            ariaLabel="Pieces made by day of the week"
          />
        </ChartCard>
      )}

      {/* 7. Stock at the production house */}
      <section className="flex flex-col gap-3" aria-labelledby="prod-stock-title">
        <SectionHeading
          id="prod-stock-title"
          title={t('wp8.prod.stock')}
          caption="Opening balance + made this month − sent to stores"
          actions={managesSettings ? (
            <OverflowMenu
              items={[
                {
                  label: t('wp8.prod.alertSettings'),
                  icon: <SlidersHorizontal className="size-4" aria-hidden="true" />,
                  onSelect: () => { setTempStockAlertThresholds(JSON.parse(JSON.stringify(stockAlertThresholds))); setShowStockAlertModal(true); },
                },
                {
                  label: t('wp8.prod.plateSettings'),
                  icon: <Settings className="size-4" aria-hidden="true" />,
                  onSelect: () => { setTempMomosPerPlate(momosPerPlate); setShowPlateSettingsModal(true); },
                },
                (isOperationsManager || isClusterHead) && onNavigateToManageItems && {
                  label: t('wp8.prod.manageItems'),
                  icon: <Package className="size-4" aria-hidden="true" />,
                  onSelect: () => onNavigateToManageItems(),
                },
              ]}
            />
          ) : undefined}
        />
        {analyticsMode === 'store' && context.user?.role === 'cluster_head' && context.productionHouses && context.productionHouses.length > 0 && (
          <Field label="Production house">
            <select
              value={selectedProductionHouseId || 'all'}
              onChange={(e) => setSelectedProductionHouseId(e.target.value === 'all' ? null : e.target.value)}
              className={controlClasses}
            >
              <option value="all">All production houses</option>
              {context.productionHouses.map((ph) => (
                <option key={ph.id} value={ph.id}>{ph.name} (ID: {ph.id})</option>
              ))}
            </select>
          </Field>
        )}
        {managesSettings && isProductionIncharge && (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" leadingIcon={<Calendar />} onClick={() => setShowRecalibration(true)}>{t('wp8.prod.recalibrate')}</Button>
            {latestRecalibration && latestRecalibration.date ? (
              <span className="text-label text-text-3">Last recalibrated {formatDateIST(latestRecalibration.date)} IST</span>
            ) : previousMonthStock && !latestRecalibration ? (
              <span className="text-label text-text-3">No stock count yet: worked out from all records</span>
            ) : null}
          </div>
        )}
        {stock.noData ? (
          <Card>
            <EmptyState
              compact
              icon={Package}
              title="No production data"
              body={stock.effectiveProductionHouseId ? 'No production records found for the selected production house.' : 'No production records found. Start logging production to see stock status.'}
            />
          </Card>
        ) : (
          <>
            {stock.hasOpeningBalance && (
              <HowItWorks title="How stock is worked out" label="Stock carries forward automatically">
                <p>Stock = the last stock count + momos made since (entries not rejected) − momos sent since (shipped or delivered, to stores and event stalls) + event leftovers counted back in.</p>
                <p>Chicken and veg base stock also goes down by the kurkure made from it.</p>
                <p>
                  {latestRecalibration && latestRecalibration.date
                    ? `It starts from the stock count on ${formatDateIST(latestRecalibration.date)} (IST). Opening is what that leaves at the start of this month.`
                    : 'No stock count yet, so it is worked out from all production and shipments on record.'}
                </p>
              </HowItWorks>
            )}
            <ListGroup>
              {stock.rows.map((r) => (
                <ListRow
                  key={r.key}
                  title={r.label}
                  subtitle={`${r.opening > 0 ? `Opening ${fmt(r.opening)} · ` : ''}Made ${fmt(r.produced)} · Sent ${fmt(r.sent)} · ${Math.round(r.stock / momosPerPlate)} plates left`}
                  trailing={
                    <span className="flex flex-col items-end gap-1">
                      <span className={cn('num text-body-md font-semibold', r.level && r.level !== 'medium' ? 'text-danger' : 'text-text')}>{fmt(r.stock)} pcs</span>
                      {r.level && <StatusChip tone={STOCK_LEVEL[r.level].tone} icon={AlertTriangle}>{STOCK_LEVEL[r.level].label}</StatusChip>}
                    </span>
                  }
                />
              ))}
            </ListGroup>
          </>
        )}
      </section>

      {/* 8. Production houses compared (only with more than one house) */}
      {leaderboard.length > 0 && (
        <ListGroup title={t('wp8.prod.compare')} meta={period}>
          {leaderboard.map((r, idx) => (
            <ListRow
              key={r.id}
              leading={<span className="num flex size-9 items-center justify-center rounded-md bg-surface-2 text-body-sm font-semibold text-text-2">{idx + 1}</span>}
              title={r.name}
              subtitle={`${r.yieldPcsPerKg !== null ? `${r.yieldPcsPerKg} pcs a kg · ` : ''}${r.wastagePct}% waste`}
              chip={r.wastagePct > 5 ? <StatusChip tone="danger">High waste</StatusChip> : undefined}
              trailing={<span className="num text-body-md font-semibold text-text">{fmt(r.totalFinal)} pcs</span>}
            />
          ))}
        </ListGroup>
      )}

      {/* 9. Production ledger (one house only) */}
      {selectedProductionHouseId && !(ledger && ledger.empty) && (
        <section className="flex flex-col gap-3" aria-labelledby="prod-ledger-title">
          <SectionHeading
            id="prod-ledger-title"
            title={t('wp8.prod.ledger')}
            caption={`Dough, stuffing, batter and coating, carried forward day to day · since ${shortDateLabel(PRODUCTION_LEDGER_GO_LIVE_DATE, lang)}`}
          />
          {productionLedgerRangeLoading ? (
            <SkeletonChart height={200} />
          ) : !ledger ? (
            <Card>
              <EmptyState compact icon={Package} title="No closed days yet" body={`Ledger tracking starts ${PRODUCTION_LEDGER_GO_LIVE_DATE} - no closed days yet for this house in the selected range.`} />
            </Card>
          ) : ledger.empty ? null : (
            <>
              {ledger.risky.length > 0 && (
                <Callout tone="warning" title="Leftover sitting unused for several days">
                  {ledger.risky.map((r) => `${r.label}: untouched ${r.days} day${r.days === 1 ? '' : 's'} in a row`).join(' · ')}
                </Callout>
              )}
              <div className="lg:hidden">
                <ListGroup>
                  {ledger.utilizationRows.map((r) => (
                    <ListRow
                      key={r.id}
                      title={r.label}
                      subtitle={`Prepared ${r.prepared.toFixed(2)} kg · used ${r.utilizationPct === null ? '—' : `${r.utilizationPct}%`}`}
                      chip={r.daysCover !== null && r.daysCover > 7 ? <StatusChip tone="warning">{r.daysCover} days cover</StatusChip> : undefined}
                      trailing={
                        <span className="flex flex-col items-end">
                          <span className="num text-body-md font-semibold text-text">{r.closingActual === null ? '—' : `${r.closingActual.toFixed(2)} kg`}</span>
                          <span className="num text-caption text-text-3">{r.daysCover === null ? 'left' : `left · ${r.daysCover} days`}</span>
                        </span>
                      }
                    />
                  ))}
                </ListGroup>
              </div>
              <div className="hidden lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pool</TableHead>
                      <TableHead numeric>Prepared (period)</TableHead>
                      <TableHead numeric>Utilisation</TableHead>
                      <TableHead numeric>Left now</TableHead>
                      <TableHead numeric>Days of stock cover</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledger.utilizationRows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.label}</TableCell>
                        <TableCell numeric>{r.prepared.toFixed(2)} kg</TableCell>
                        <TableCell numeric>{r.utilizationPct === null ? '—' : `${r.utilizationPct}%`}</TableCell>
                        <TableCell numeric>{r.closingActual === null ? '—' : `${r.closingActual.toFixed(2)} kg`}</TableCell>
                        <TableCell numeric className={r.daysCover !== null && r.daysCover > 7 ? 'font-semibold text-warning' : 'text-text-2'}>{r.daysCover === null ? '—' : `${r.daysCover} days`}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <ChartCard
                title="Pool, day by day"
                legend={[
                  { label: 'Opening', color: CHART_SERIES[3] },
                  { label: 'Prepared', color: CHART_SERIES[1] },
                  { label: 'Closing (counted)', color: CHART_SERIES[0] },
                ]}
              >
                <FilterChips
                  aria-label="Pool"
                  value={ledger.activePoolId}
                  onValueChange={setSelectedLedgerPoolId}
                  options={ledger.utilizationRows.map((r) => ({ value: r.id, label: r.label }))}
                />
                <TrendChart
                  data={ledger.trendData}
                  xKey="label"
                  format={(v: number) => `${v} kg`}
                  height={220}
                  series={[
                    { key: `${ledger.activePoolId}_opening`, name: 'Opening', color: CHART_SERIES[3] },
                    { key: `${ledger.activePoolId}_prepared`, name: 'Prepared', color: CHART_SERIES[1] },
                    { key: `${ledger.activePoolId}_closing`, name: 'Closing (counted)', color: CHART_SERIES[0] },
                  ]}
                  ariaLabel="Opening, prepared and counted closing kg of the chosen pool, a day"
                />
              </ChartCard>
              {ledger.actualYieldRows.length > 0 && (
                <ListGroup
                  title="Yield from what was actually used"
                  footer="Pieces made per kg actually drawn from that type's own pool - only dates the ledger covers."
                >
                  {ledger.actualYieldRows.map((r) => (
                    <ListRow
                      key={r.key}
                      density="compact"
                      title={r.label}
                      subtitle={`${fmt(r.piecesMade)} pcs · ${r.consumedKg.toFixed(2)} kg used`}
                      trailing={<span className="num text-body-md font-semibold text-text">{r.yieldPcsPerKg === null ? '—' : `${r.yieldPcsPerKg} pcs a kg`}</span>}
                    />
                  ))}
                </ListGroup>
              )}
            </>
          )}
        </section>
      )}

      {/* 10. Wastage */}
      <section className="flex flex-col gap-3" aria-labelledby="prod-wastage-title">
        <SectionHeading id="prod-wastage-title" title={t('wp8.prod.wastage')} caption="Track and cut production wastage" />
        {wastageStatus.recordCount === 0 ? (
          <Callout tone="warning" title="No production data found">Pick a production house, or check production has been logged.</Callout>
        ) : wastageStatus.withWastage === 0 ? (
          <Callout tone="info" title="No wastage recorded">
            {wastageStatus.recordCount} production record{wastageStatus.recordCount === 1 ? '' : 's'}, but no wastage logged yet. Wastage is entered in Production.
          </Callout>
        ) : null}
        {wastageTrend.currentDates.length > 0 && (
          <ChartCard
            title={t('wp8.prod.wastageTrend')}
            caption={`Kg wasted a day · ${period}`}
            legend={legendFor([
              { key: 'wastage', name: 'Wastage (kg)', color: CHART_SERIES[0] },
              { key: 'prev', name: '', color: CHART_COLORS.previous, dashed: true },
            ], t('insights.lastPeriod'))}
          >
            <TrendChart
              data={withShort(wastageTrend.wastageChartData)}
              xKey="short"
              format={(v: number) => kg(v)}
              axisFormat={(v: number) => `${v}`}
              height={220}
              series={[
                { key: 'wastage', name: 'Wastage (kg)', color: CHART_SERIES[0] },
                { key: 'prev_wastage', name: 'Wastage, last period', color: CHART_COLORS.previous, dashed: true },
              ]}
              ariaLabel="Kg of raw material wasted a day"
            />
          </ChartCard>
        )}
        <ChartCard
          title={t('wp8.prod.wastageByType')}
          legend={[
            { label: 'Dough', color: CHART_SERIES[0], shape: 'square' },
            { label: 'Stuffing', color: CHART_SERIES[1], shape: 'square' },
            { label: 'Batter', color: CHART_SERIES[2], shape: 'square' },
            { label: 'Coating', color: CHART_SERIES[3], shape: 'square' },
          ]}
        >
          <FilterChips
            aria-label="Wastage period"
            value={wastageTimeFilter}
            onValueChange={(v) => setWastageTimeFilter(v as WastageTimeFilter)}
            options={[
              { value: 'daily', label: 'Last 5 days' },
              { value: 'weekly', label: 'Last 5 weeks' },
              { value: 'monthly', label: 'Last 5 months' },
              { value: 'yearly', label: 'Last 5 years' },
              { value: 'custom', label: 'Insights period' },
            ]}
          />
          {wastageBreakdown.length === 0 ? (
            <ChartEmpty title="No wastage in this window" />
          ) : (
            <TrendChart
              data={wastageBreakdown}
              xKey="period"
              format={(v: number) => `${v.toFixed(2)} kg`}
              axisFormat={(v: number) => `${v}`}
              height={240}
              series={[
                { key: 'dough', name: 'Dough', color: CHART_SERIES[0], kind: 'bar' },
                { key: 'stuffing', name: 'Stuffing', color: CHART_SERIES[1], kind: 'bar' },
                { key: 'batter', name: 'Batter', color: CHART_SERIES[2], kind: 'bar' },
                { key: 'coating', name: 'Coating', color: CHART_SERIES[3], kind: 'bar' },
              ]}
              ariaLabel="Kg wasted by material: dough, stuffing, batter and coating"
            />
          )}
        </ChartCard>
      </section>

      {/* 11. SOP limits (cluster head) - the editor opens in a sheet */}
      {isClusterHead && (
        <ListGroup
          title={t('wp8.prod.sop')}
          meta={`± ${sopDiversionPercent}% allowed`}
          action={<Button variant="secondary" size="sm" leadingIcon={<Pencil />} onClick={openSopEditor}>{t('common.edit')}</Button>}
          footer="Standard ingredient use per piece, in grams. Using too little or too much is outside SOP."
        >
          {Object.entries(sopThresholds).map(([key, values]: [string, any]) => (
            <ListRow
              key={key}
              density="compact"
              title={SOP_NAMES[key]}
              subtitle={[
                `Dough ${values.dough} g`,
                `Stuffing ${values.stuffing} g`,
                values.batter !== undefined ? `Batter ${values.batter} g` : null,
                values.coating !== undefined ? `Coating ${values.coating} g` : null,
              ].filter(Boolean).join(' · ')}
            />
          ))}
        </ListGroup>
      )}

      {/* 12. Ingredient use vs SOP for one day */}
      <section className="flex flex-col gap-3" aria-labelledby="prod-sop-check-title">
        <SectionHeading id="prod-sop-check-title" title={t('wp8.prod.sopCheck')} caption="Regular momos only: real use per piece against the SOP limit" />
        <DateStrip value={sopComplianceDate} onChange={setSopComplianceDate} max={todayIST()} />
        {!sopRows ? (
          <Card>
            <EmptyState compact icon={AlertTriangle} title={`No approved production for ${formatDateIST(sopComplianceDate)}`} body="Production entries must be approved to appear here." />
          </Card>
        ) : (
          <ListGroup>
            {sopRows.map((r) => (
              <div key={r.momoType} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-body-md font-medium text-text">{r.name}</span>
                    <span className="num text-label text-text-3">{fmt(r.quantity)} pcs</span>
                  </div>
                  <StatusChip tone={r.overallCompliance ? 'success' : 'danger'} icon={r.overallCompliance ? CheckCircle2 : AlertTriangle}>
                    {r.overallCompliance ? 'Within SOP' : 'Outside SOP'}
                  </StatusChip>
                </div>
                <MiniFigures
                  items={r.parts.map((p) => ({
                    label: `${p.name} (SOP ${p.sop} g)`,
                    value: `${p.avg.toFixed(1)} g`,
                    sub: `${p.diversion > 0 ? '+' : ''}${p.diversion.toFixed(1)}%`,
                    tone: p.ok ? 'default' : 'danger',
                  }))}
                />
              </div>
            ))}
          </ListGroup>
        )}
      </section>

      {/* The SOP editor */}
      <ResponsiveModal
        open={sopOpen && editingSop && !!tempSopThresholds}
        onOpenChange={(open) => { if (!open) cancelSop(); }}
        title={t('wp8.prod.editSop')}
        description="Standard ingredient use per piece, in grams"
        size="detail"
        footer={
          <>
            <Button size="lg" variant="secondary" onClick={cancelSop}>{t('common.cancel')}</Button>
            <Button size="lg" className="flex-1" onClick={saveSop}>{t('common.save')}</Button>
          </>
        }
      >
        {tempSopThresholds && (
          <div className="flex flex-col gap-5">
            <Field label="Maximum allowed diversion from SOP (±%)" helper="Using too little or too much is non-compliant.">
              <input
                type="number"
                min="0"
                max="20"
                step="1"
                value={tempDiversionPercent}
                onChange={(e) => setTempDiversionPercent(Number(e.target.value))}
                className={cn(controlClasses, 'num w-32')}
              />
            </Field>
            {Object.entries(tempSopThresholds).map(([key, values]: [string, any]) => (
              <fieldset key={key} className="flex flex-col gap-2">
                <legend className="mb-2 text-subtitle font-semibold text-text">{SOP_NAMES[key]}</legend>
                <div className="grid grid-cols-2 gap-3">
                  {(['dough', 'stuffing', 'batter', 'coating'] as const).filter((f) => f === 'dough' || f === 'stuffing' || values[f] !== undefined).map((f) => (
                    <label key={f} className="flex min-w-0 flex-col gap-1 text-label text-text-2">
                      {f[0].toUpperCase() + f.slice(1)} (g a piece)
                      <input
                        type="number"
                        value={values[f]}
                        onChange={(e) => setTempSopThresholds({ ...tempSopThresholds, [key]: { ...tempSopThresholds[key], [f]: Number(e.target.value) } })}
                        className={cn(controlClasses, 'num')}
                      />
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        )}
      </ResponsiveModal>
    </div>
  );
}
