// Insights (design review d4, wireframe Insights). The shell's top bar carries the title, the
// store chip (owner, two or more stores) and Ask Bunny; this screen adds the [Store | Production
// (| Events)] choice, the period chip, one row of tabs, and the tab itself. Every figure comes
// from insights/useAnalyticsData.ts; each tab lives in insights/tabs/*.
//
// Money > Cash opens this screen on its cash tab (initialTab 'cash-reconciliation'): then only
// the period chip and that tab show. A stock-request notification can still open the Stock
// requests tab (highlightRequestId / initialTab 'production-requests').
import { useCallback, useMemo, useRef, useState, memo, lazy, Suspense } from 'react';
import { Factory } from 'lucide-react';
import { SectionSkeleton, ModalSkeleton } from './LoadingSkeleton';
import { useAnalyticsData, type AnalyticsProps } from './insights/useAnalyticsData';
import { useEventsSummary, hasEvents } from './insights/eventsSummary';
import { OverviewTab } from './insights/tabs/OverviewTab';
import { RevenueTab } from './insights/tabs/RevenueTab';
import { ItemsTab } from './insights/tabs/ItemsTab';
import { CostsTab } from './insights/tabs/CostsTab';
import { UnitEconomicsTab } from './insights/tabs/UnitEconomicsTab';
import { CashTab } from './insights/tabs/CashTab';
import { ProductionTab } from './insights/tabs/ProductionTab';
import { SlaTab } from './insights/tabs/SlaTab';
import { RecalibrationTab } from './insights/tabs/RecalibrationTab';
import { TrendsTab } from './insights/tabs/TrendsTab';
import { EventsTab } from './insights/tabs/EventsTab';
import { PlateSettingsSheet, StockAlertSheet } from './insights/tabs/ProductionSettingsSheets';
import { SegmentedControl } from './ui/segmented-control';
import { DateRangeChip } from './ui/date-range-chip';
import { RANGE_PRESETS, rangeForPreset, type DateRange, type RangePreset } from './ui/date-utils';
import { SelectChip } from './ui/chip';
import { PickerSheet } from './ui/picker-sheet';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { Callout } from './ui/callout';
import { SkeletonChart, SkeletonStatTiles } from './ui/skeleton';
import { useT, type I18nKey } from '../utils/i18n';

const ProductionRequests = lazy(() => import('./ProductionRequests').then((m) => ({ default: m.ProductionRequests })));
const MonthlyStockRecalibration = lazy(() => import('./MonthlyStockRecalibration').then((m) => ({ default: m.MonthlyStockRecalibration })));
const SalaryBreakdownModal = lazy(() => import('./SalaryBreakdownModal').then((m) => ({ default: m.SalaryBreakdownModal })));
const CommissionBreakdownModal = lazy(() => import('./CostBreakdownModals').then((m) => ({ default: m.CommissionBreakdownModal })));
const InterestBreakdownModal = lazy(() => import('./CostBreakdownModals').then((m) => ({ default: m.InterestBreakdownModal })));
const CostLineModal = lazy(() => import('./CostLineModal').then((m) => ({ default: m.CostLineModal })));
const ExpenseBreakdownModal = lazy(() => import('./ExpenseBreakdownModal').then((m) => ({ default: m.ExpenseBreakdownModal })));

export function Analytics(props: AnalyticsProps) {
  const latestProps = useRef(props);
  latestProps.current = props;
  const toManageItems = useCallback(() => latestProps.current.onNavigateToManageItems?.(), []);
  const toProductionManagement = useCallback(() => latestProps.current.onNavigateToProductionManagement?.(), []);
  return (
    <AnalyticsScreen
      {...props}
      onNavigateToManageItems={props.onNavigateToManageItems ? toManageItems : undefined}
      onNavigateToProductionManagement={props.onNavigateToProductionManagement ? toProductionManagement : undefined}
    />
  );
}

type View = 'overview' | 'profit' | 'expense' | 'unit-economics' | 'sales' | 'cash-reconciliation' | 'production' | 'production-requests' | 'stock-request-analysis' | 'recalibration-reports' | 'trends';
type Mode = 'store' | 'production' | 'events';

const TAB_LABEL: Record<View, I18nKey> = {
  overview: 'insights.tab.overview',
  profit: 'insights.tab.revenue',
  sales: 'insights.tab.items',
  expense: 'insights.tab.costs',
  'unit-economics': 'insights.tab.perPlate',
  trends: 'insights.tab.trends',
  'cash-reconciliation': 'insights.tab.cash',
  'production-requests': 'insights.tab.requests',
  production: 'insights.tab.production',
  'stock-request-analysis': 'insights.tab.sla',
  'recalibration-reports': 'insights.tab.recalibration',
};

const PROD_PRESET: Record<string, RangePreset> = { today: 'today', yesterday: 'yesterday', thisWeek: 'thisWeek', thisMonth: 'thisMonth', previousMonth: 'lastMonth', thisYear: 'thisYear' };

const AnalyticsScreen = memo(function AnalyticsScreen({ context, selectedStoreId, highlightRequestId, initialTab, onNavigateToManageItems, onNavigateToProductionManagement }: AnalyticsProps) {
  const d = useAnalyticsData({ context, selectedStoreId, highlightRequestId, initialTab, onNavigateToManageItems, onNavigateToProductionManagement });
  const { t, lang } = useT();
  const {
    onlineLoans, isClusterHead, isManager, isAudit, isProductionIncharge, isStoreIncharge, isOperationsManager, analyticsMode, setAnalyticsMode,
    effectiveStoreId, activeView, setActiveView, selectedExpenseCategory, setSelectedExpenseCategory, costLine, setCostLine, showRecalibration,
    setShowRecalibration, setLatestRecalibration, setPreviousMonthStock, selectedProductionHouseId, setSelectedProductionHouseId, loading,
    fetchRecalibrationAndCalculateOpeningBalance, getPeriodLabel, activeSettlementDateRange, metrics, salaryBreakdownData, commissionBreakdownSettlements,
    buildCostLine, timeFilterChoice, setTimeFilterChoice, customDateRange, setDateRange, periodRange, productionDateRange, setProductionDateRange,
    setCustomStartDate, setCustomEndDate, getDateRangeBounds,
  } = d;

  // ---- Who sees what (same predicates as the old tab bar and mode selector) --------------------
  const focusCash = initialTab === 'cash-reconciliation';
  const showModeToggle = (isClusterHead || isManager || isProductionIncharge || isStoreIncharge || isAudit) && !isStoreIncharge;
  // Owner and operations manager have Cash & Paytm under Money now; everyone else keeps it here.
  const cashInInsights = !(isClusterHead || isOperationsManager);
  // The SLA tab sits with Production; logins without the Production side keep it under Store.
  const slaInStore = !showModeToggle;
  const showRequestsTab = isAudit || activeView === 'production-requests';
  const canPickHouse = isClusterHead || isManager || isAudit;

  const events = useEventsSummary(periodRange.startDate, periodRange.endDate, !focusCash && showModeToggle);
  const [eventsMode, setEventsMode] = useState(false);
  const showEvents = hasEvents(events) || (eventsMode && events.status === 'ready');
  const mode: Mode = eventsMode && showEvents ? 'events' : analyticsMode;

  const storeTabs: View[] = [
    'overview', 'profit', 'sales', 'expense', 'unit-economics', 'trends',
    ...(cashInInsights ? (['cash-reconciliation'] as View[]) : []),
    ...(slaInStore ? (['stock-request-analysis'] as View[]) : []),
    ...(showRequestsTab ? (['production-requests'] as View[]) : []),
  ];
  const productionTabs: View[] = ['production', 'stock-request-analysis', 'recalibration-reports'];
  const tabs = mode === 'production' ? productionTabs : storeTabs;

  const changeMode = (next: Mode) => {
    if (next === 'events') {
      setEventsMode(true);
      return;
    }
    setEventsMode(false);
    if (next === 'store' && activeView === 'stock-request-analysis' && !slaInStore) setActiveView('overview');
    setAnalyticsMode(next);
  };

  // ---- The period chip: the store period (store and events) or the production period ----------
  const storeRange: DateRange = useMemo(() => {
    if (timeFilterChoice === 'custom') return { preset: 'custom', from: customDateRange.from, to: customDateRange.to };
    if ((RANGE_PRESETS as string[]).includes(timeFilterChoice)) return rangeForPreset(timeFilterChoice as RangePreset);
    return { preset: 'custom', from: periodRange.startDate, to: periodRange.endDate };
  }, [timeFilterChoice, customDateRange, periodRange]);
  const productionRange: DateRange = useMemo(() => {
    const preset = PROD_PRESET[productionDateRange];
    if (preset) return rangeForPreset(preset);
    const { startDate, endDate } = getDateRangeBounds();
    return { preset: 'custom', from: startDate, to: endDate };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productionDateRange, d.customStartDate, d.customEndDate]);
  const onStoreRange = (range: DateRange) => {
    if (range.preset === 'custom') {
      setDateRange({ from: range.from, to: range.to });
      setTimeFilterChoice('custom');
    } else setTimeFilterChoice(range.preset);
  };
  const onProductionRange = (range: DateRange) => {
    const direct = Object.entries(PROD_PRESET).find(([, p]) => p === range.preset)?.[0];
    if (direct) {
      setProductionDateRange(direct as typeof productionDateRange);
      return;
    }
    setCustomStartDate(range.from);
    setCustomEndDate(range.to);
    setProductionDateRange('custom');
  };

  const [housePickerOpen, setHousePickerOpen] = useState(false);
  const houses = context.productionHouses || [];
  const houseName = (() => {
    if (canPickHouse) return houses.find((h) => h.id === selectedProductionHouseId)?.name;
    const userStore = context.stores?.find((s) => s.id === context.user?.storeId);
    return houses.find((h) => h.id === userStore?.productionHouseId || h.id === context.user?.storeId)?.name || 'Your production house';
  })();

  if (loading) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4">
        <SkeletonStatTiles count={4} />
        <SkeletonChart />
      </div>
    );
  }

  const modeOptions = [
    { value: 'store' as Mode, label: t('insights.store') },
    { value: 'production' as Mode, label: t('insights.production') },
    ...(showEvents ? [{ value: 'events' as Mode, label: t('insights.events') }] : []),
  ];

  return (
    <div className="flex min-h-full flex-col bg-bg" lang={lang}>
      {/* Controls band under the shell's top bar */}
      <div className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-2.5 lg:px-8">
          {showModeToggle && !focusCash && (
            <SegmentedControl<Mode>
              size="sm"
              aria-label={t('insights.modeLabel')}
              value={mode}
              onValueChange={changeMode}
              options={modeOptions}
              className={modeOptions.length > 2 ? 'w-full sm:w-auto sm:min-w-80' : 'min-w-0 flex-1 basis-48 sm:max-w-sm'}
            />
          )}
          {mode === 'production' ? (
            <DateRangeChip value={productionRange} onChange={onProductionRange} />
          ) : (
            <DateRangeChip value={storeRange} onChange={onStoreRange} />
          )}
          {mode === 'production' && canPickHouse && houses.length > 0 && (
            <SelectChip leadingIcon={<Factory aria-hidden="true" />} onClick={() => setHousePickerOpen(true)} aria-haspopup="dialog">
              {houseName || t('insights.pickHouse')}
            </SelectChip>
          )}
          {mode === 'production' && !canPickHouse && isProductionIncharge && (
            <span className="inline-flex min-h-9 items-center gap-1.5 text-label text-text-2">
              <Factory className="size-4" aria-hidden="true" />
              {houseName}
            </span>
          )}
        </div>
        {!focusCash && mode !== 'events' && (
          <Tabs value={activeView} onValueChange={(v) => setActiveView(v as View)}>
            <div className="mx-auto w-full max-w-7xl lg:px-4">
              <TabsList aria-label={t('insights.sections')} className="border-b-0">
                {tabs.map((view) => (
                  <TabsTrigger key={view} value={view}>{t(TAB_LABEL[view])}</TabsTrigger>
                ))}
              </TabsList>
            </div>
          </Tabs>
        )}
      </div>

      <div className="mx-auto w-full max-w-7xl px-4 py-4 lg:px-8 lg:py-6">
        {mode === 'events' && events.status === 'ready' ? (
          <EventsTab summary={events.summary} periodLabel={getPeriodLabel()} />
        ) : focusCash ? (
          <CashTab d={d} />
        ) : (
          <>
            {mode === 'production' && canPickHouse && !selectedProductionHouseId && activeView !== 'stock-request-analysis' && (
              <Callout tone="info" title={t('insights.pickHouse')} className="mb-4" onClick={() => setHousePickerOpen(true)}>
                {t('insights.pickHouseBody')}
              </Callout>
            )}
            {activeView === 'overview' && <OverviewTab d={d} events={events} onOpenTab={setActiveView} />}
            {activeView === 'profit' && <RevenueTab d={d} />}
            {activeView === 'sales' && <ItemsTab d={d} />}
            {activeView === 'expense' && <CostsTab d={d} />}
            {activeView === 'unit-economics' && <UnitEconomicsTab d={d} />}
            {activeView === 'cash-reconciliation' && <CashTab d={d} />}
            {activeView === 'production' && <ProductionTab d={d} />}
            {activeView === 'trends' && analyticsMode === 'store' && <TrendsTab d={d} />}
            {activeView === 'stock-request-analysis' && <SlaTab d={d} />}
            {activeView === 'recalibration-reports' && <RecalibrationTab d={d} />}
            {activeView === 'production-requests' && (
              <Suspense fallback={<SectionSkeleton />}>
                <ProductionRequests
                  context={context}
                  highlightRequestId={highlightRequestId || null}
                  selectedStoreId={effectiveStoreId}
                  onNavigateToManageItems={onNavigateToManageItems}
                />
              </Suspense>
            )}
          </>
        )}
      </div>

      <PickerSheet
        open={housePickerOpen}
        onOpenChange={setHousePickerOpen}
        title={t('insights.pickHouse')}
        items={houses.map((h) => ({ value: h.id, label: h.name, description: h.location || undefined }))}
        value={selectedProductionHouseId}
        onSelect={(value) => {
          setSelectedProductionHouseId(value || null);
          setHousePickerOpen(false);
        }}
      />

      <StockAlertSheet d={d} />
      <PlateSettingsSheet d={d} />

      {showRecalibration && (
        <Suspense fallback={<ModalSkeleton />}>
          <MonthlyStockRecalibration
            context={context}
            selectedStoreId={analyticsMode === 'production' ? selectedProductionHouseId : effectiveStoreId}
            currentCalculatedStock={analyticsMode === 'production' ? (window as any).__currentProductionHouseStock : undefined}
            onClose={() => {
              setShowRecalibration(false);
              // Refresh opening balance data after recalibration
              if (analyticsMode === 'production') {
                // Clear existing opening balance to force refetch
                setPreviousMonthStock(null);
                setLatestRecalibration(null);
                // Longer delay to ensure backend has processed and committed the save
                setTimeout(() => {
                  fetchRecalibrationAndCalculateOpeningBalance();
                }, 1500);
              }
            }}
            onSaveSuccess={() => {
              // Clear cached data
              setPreviousMonthStock(null);
              setLatestRecalibration(null);
              (window as any).__currentProductionHouseStock = null;
              // Force immediate refetch
              setTimeout(() => {
                fetchRecalibrationAndCalculateOpeningBalance();
              }, 500);
            }}
            isProductionHouse={analyticsMode === 'production'}
          />
        </Suspense>
      )}

      {/* The breakdown pop-ups (only one is ever open, so they share one loading fallback) */}
      <Suspense fallback={<ModalSkeleton />}>
        {selectedExpenseCategory && selectedExpenseCategory.type === 'salary' && salaryBreakdownData && (
          <SalaryBreakdownModal
            totalAmount={selectedExpenseCategory.amount}
            data={salaryBreakdownData}
            periodLabel={getPeriodLabel()}
            canSeeEmployeeDetail={context.user?.role === 'cluster_head'}
            onClose={() => setSelectedExpenseCategory(null)}
          />
        )}
        {selectedExpenseCategory && selectedExpenseCategory.type === 'commission' && (
          <CommissionBreakdownModal
            totalAmount={metrics.commissionExpenses + metrics.adSpend}
            settlements={commissionBreakdownSettlements}
            costs={metrics.online}
            range={activeSettlementDateRange}
            periodLabel={getPeriodLabel()}
            onClose={() => setSelectedExpenseCategory(null)}
          />
        )}
        {selectedExpenseCategory && selectedExpenseCategory.type === 'interest' && (
          <InterestBreakdownModal
            totalAmount={selectedExpenseCategory.amount}
            loans={onlineLoans.filter((l) => !effectiveStoreId || l.storeId === effectiveStoreId)}
            range={activeSettlementDateRange}
            periodLabel={getPeriodLabel()}
            onClose={() => setSelectedExpenseCategory(null)}
          />
        )}
        {costLine && (() => {
          const detail = buildCostLine(costLine);
          return (
            <CostLineModal
              title={detail.title}
              periodLabel={getPeriodLabel()}
              groups={detail.groups}
              note={detail.note}
              revenue={metrics.totalRevenue}
              onClose={() => setCostLine(null)}
            />
          );
        })()}
        {selectedExpenseCategory && !selectedExpenseCategory.type && (
          <ExpenseBreakdownModal
            category={selectedExpenseCategory.category}
            items={selectedExpenseCategory.items}
            totalAmount={selectedExpenseCategory.amount}
            onClose={() => setSelectedExpenseCategory(null)}
          />
        )}
      </Suspense>
    </div>
  );
});
