// Insights > Trends tab. Moved verbatim from Analytics.tsx (WP2 step 1, no visual change).
import { lazy, Suspense } from 'react';
import { SectionSkeleton } from '../../LoadingSkeleton';
import { type AnalyticsData } from '../useAnalyticsData';

const TrendsGrowth = lazy(() => import('../TrendsGrowth').then((m) => ({ default: m.TrendsGrowth })));

export function TrendsTab({ d }: { d: AnalyticsData }) {
 const { context, insightsStoreId, canManageInsights } = d;
 return (
 <>
 {(
 <Suspense fallback={<SectionSkeleton />}>
 <TrendsGrowth accessToken={context.user?.accessToken || ''} storeId={insightsStoreId} canManage={canManageInsights} />
 </Suspense>
 )}
 </>
 );
}
