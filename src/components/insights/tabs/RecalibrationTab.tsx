// Insights > Recalibration tab. Moved verbatim from Analytics.tsx (WP2 step 1, no visual change).
import { lazy, Suspense } from 'react';
import { SectionSkeleton } from '../../LoadingSkeleton';
import { type AnalyticsData } from '../useAnalyticsData';

const RecalibrationReports = lazy(() => import('../../RecalibrationReports').then((m) => ({ default: m.RecalibrationReports })));

export function RecalibrationTab({ d }: { d: AnalyticsData }) {
 const { context, selectedStoreId, analyticsMode, setShowRecalibration, selectedProductionHouseId } = d;
 return (
 <>
 {(
 <div>
 <Suspense fallback={<SectionSkeleton />}>
 <RecalibrationReports
 context={context}
 selectedStoreId={analyticsMode === 'production' ? selectedProductionHouseId : selectedStoreId}
 onOpenRecalibration={() => setShowRecalibration(true)}
 locationType="production_house"
 />
 </Suspense>
 </div>
 )}
 </>
 );
}
