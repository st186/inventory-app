// Insights > Store-production SLA: how fast stock requests are accepted, packed, shipped and
// received (StockAnalysis). It now sits with Production; it keeps the store scope it had under
// Store (the store picked in the top bar, or the login's own store), so its figures don't change
// with the move.
import { lazy, memo, Suspense, useMemo } from 'react';
import { SectionSkeleton } from '../../LoadingSkeleton';
import { type AnalyticsData } from '../useAnalyticsData';

const StockAnalysis = lazy(() => import('../../StockAnalysis').then((m) => ({ default: m.StockAnalysis })));

export const SlaTab = memo(function SlaTab({ d }: { d: AnalyticsData }) {
  const {
    context, selectedStoreId, analyticsMode, productionInchargeDefaultStoreId, isClusterHead, isManager, isProductionIncharge, isAudit,
    stockAnalysisFinishedProducts, stockAnalysisRequests, stockAnalysisSalesData, stockAnalysisStoreIds,
  } = d;
  // Same formula as effectiveStoreId in Store mode.
  const storeId = selectedStoreId || productionInchargeDefaultStoreId || (!(isClusterHead || isManager || isProductionIncharge || isAudit) ? (context.user?.storeId || null) : null);
  const scoped = useMemo(() => {
    if (analyticsMode === 'store') return { requests: stockAnalysisRequests, sales: stockAnalysisSalesData, storeIds: stockAnalysisStoreIds };
    return {
      requests: (context.productionRequests || []).filter((req) => !storeId || req.storeId === storeId),
      sales: (context.categorySalesData || []).filter((s) => !storeId || s.storeId === storeId),
      storeIds: storeId ? [storeId] : (context.stores || []).map((st) => st.id),
    };
  }, [analyticsMode, stockAnalysisRequests, stockAnalysisSalesData, stockAnalysisStoreIds, context.productionRequests, context.categorySalesData, context.stores, storeId]);
  return (
    <Suspense fallback={<SectionSkeleton />}>
      <StockAnalysis
        requests={scoped.requests}
        finishedProducts={stockAnalysisFinishedProducts}
        salesData={scoped.sales}
        storeIds={scoped.storeIds}
        accessToken={context.user?.accessToken}
      />
    </Suspense>
  );
});
