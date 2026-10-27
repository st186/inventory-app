// Dev-only: Insights > Production on its own (polish-preview.html?screen=production), driven by
// the real useAnalyticsData hook on the made-up data. &period=thisMonth|lastMonth|last6Months|...
// picks the Insights period and &house=PH-1 the production house. &old=1 renders a pre-WP8 copy
// for the number check when one has been put next to the tab as __wp8old_ProductionTab.tsx
// (never committed).
import { Suspense, lazy, useEffect, type ComponentType } from 'react';
import type { InventoryContextType } from '../App';
import { useAnalyticsData, type TimeFilterChoice } from '../components/insights/useAnalyticsData';

const params = new URLSearchParams(location.search);
const OLD = import.meta.glob('../components/insights/tabs/__wp8old_ProductionTab.tsx');
const Tab = lazy<ComponentType<any>>(() =>
  params.get('old') === '1' && OLD['../components/insights/tabs/__wp8old_ProductionTab.tsx']
    ? (OLD['../components/insights/tabs/__wp8old_ProductionTab.tsx']() as Promise<any>).then((m) => ({ default: m.ProductionTab }))
    : import('../components/insights/tabs/ProductionTab').then((m) => ({ default: m.ProductionTab })),
);

export function ProductionDemo({ context }: { context: InventoryContextType }) {
  const d = useAnalyticsData({ context, selectedStoreId: null });
  // The production period: today | yesterday | thisWeek | thisMonth | previousMonth | thisYear
  const period = params.get('period') || 'thisMonth';
  const house = params.has('house') ? params.get('house') || null : 'PH-1';
  useEffect(() => {
    d.setAnalyticsMode('production');
    d.setProductionDateRange(period as any);
    d.setTimeFilterChoice((period === 'previousMonth' ? 'lastMonth' : period) as TimeFilterChoice);
    d.setSelectedProductionHouseId(house);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (d.analyticsMode !== 'production') return null;
  return (
    <Suspense fallback={null}>
      <Tab d={d} />
    </Suspense>
  );
}
