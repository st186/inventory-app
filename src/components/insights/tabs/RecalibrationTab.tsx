// Insights > Production > Recalibration: the production house's monthly stock counts
// (RecalibrationReports, owned by the Stock package - props unchanged).
import { lazy, memo, Suspense } from 'react';
import { SectionSkeleton } from '../../LoadingSkeleton';
import { type AnalyticsData } from '../useAnalyticsData';

const RecalibrationReports = lazy(() => import('../../RecalibrationReports').then((m) => ({ default: m.RecalibrationReports })));

export const RecalibrationTab = memo(function RecalibrationTab({ d }: { d: AnalyticsData }) {
  const { context, selectedStoreId, analyticsMode, setShowRecalibration, selectedProductionHouseId } = d;
  return (
    <Suspense fallback={<SectionSkeleton />}>
      <RecalibrationReports
        context={context}
        selectedStoreId={analyticsMode === 'production' ? selectedProductionHouseId : selectedStoreId}
        onOpenRecalibration={() => setShowRecalibration(true)}
        locationType="production_house"
      />
    </Suspense>
  );
});
