// Insights > Sla tab. Moved verbatim from Analytics.tsx (WP2 step 1, no visual change).
import { lazy, Suspense } from 'react';
import { SectionSkeleton } from '../../LoadingSkeleton';
import { type AnalyticsData } from '../useAnalyticsData';

const StockAnalysis = lazy(() => import('../../StockAnalysis').then((m) => ({ default: m.StockAnalysis })));

export function SlaTab({ d }: { d: AnalyticsData }) {
 const { context, stockAnalysisFinishedProducts, stockAnalysisRequests, stockAnalysisSalesData, stockAnalysisStoreIds, salesData } = d;
 return (
 <>
 {(
 <div>
 <Suspense fallback={<SectionSkeleton />}>
 <StockAnalysis
 requests={stockAnalysisRequests}
 finishedProducts={stockAnalysisFinishedProducts}
 salesData={stockAnalysisSalesData}
 storeIds={stockAnalysisStoreIds}
 accessToken={context.user?.accessToken}
 />
 </Suspense>
 </div>
 )}
 </>
 );
}
