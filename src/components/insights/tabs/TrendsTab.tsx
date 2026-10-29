// Insights > Trends: weekday pattern, item mix, festival effects, calendar and growth ideas
// (insights/TrendsGrowth and the cards inside it).
import { lazy, memo, Suspense, useMemo } from 'react';
import { SectionSkeleton } from '../../LoadingSkeleton';
import { type AnalyticsData } from '../useAnalyticsData';

const WeatherCard = lazy(() => import('../GrowthCards').then((m) => ({ default: m.WeatherCard })));
const TrendsGrowth = lazy(() => import('../TrendsGrowth').then((m) => ({ default: m.TrendsGrowth })));

export const TrendsTab = memo(function TrendsTab({ d }: { d: AnalyticsData }) {
  const { context, insightsStoreId, canManageInsights } = d;
  // Daily counter and app sales of the store(s) in view, for what rain does to them.
  const sales = useMemo(() => {
    const byDate = new Map<string, { date: string; counter: number; online: number }>();
    for (const s of context.salesData || []) {
      if (insightsStoreId && s.storeId && s.storeId !== insightsStoreId) continue;
      const r = byDate.get(s.date) || { date: s.date, counter: 0, online: 0 };
      r.counter += Number(s.offlineSales) || 0;
      r.online += Number(s.onlineSales) || 0;
      byDate.set(s.date, r);
    }
    return [...byDate.values()];
  }, [context.salesData, insightsStoreId]);
  return (
    <Suspense fallback={<SectionSkeleton />}>
      <div className="flex flex-col gap-4 lg:gap-6">
        <WeatherCard accessToken={context.user?.accessToken || ''} sales={sales} />
        <TrendsGrowth accessToken={context.user?.accessToken || ''} storeId={insightsStoreId} canManage={canManageInsights} />
      </div>
    </Suspense>
  );
});
