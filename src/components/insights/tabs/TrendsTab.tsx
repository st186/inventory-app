// Insights > Trends: weekday pattern, item mix, festival effects, calendar and growth ideas
// (insights/TrendsGrowth and the cards inside it).
import { lazy, memo, Suspense } from 'react';
import { SectionSkeleton } from '../../LoadingSkeleton';
import { type AnalyticsData } from '../useAnalyticsData';

const TrendsGrowth = lazy(() => import('../TrendsGrowth').then((m) => ({ default: m.TrendsGrowth })));

export const TrendsTab = memo(function TrendsTab({ d }: { d: AnalyticsData }) {
  const { context, insightsStoreId, canManageInsights } = d;
  return (
    <Suspense fallback={<SectionSkeleton />}>
      <TrendsGrowth accessToken={context.user?.accessToken || ''} storeId={insightsStoreId} canManage={canManageInsights} />
    </Suspense>
  );
});
