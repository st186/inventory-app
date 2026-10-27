// Stock -> Requests (store incharge sends tomorrow's request), Production -> Requests (the
// production incharge packs and ships), and the same queue across stores for managers.
// State and actions live in stock/useStockRequests.tsx; the pieces in components/stock.
import * as React from 'react';
import { PackageCheck, Send } from 'lucide-react';
import { Button } from './ui/button';
import { ErrorState } from './ui/error-state';
import { SkeletonListRows, SkeletonText } from './ui/skeleton';
import { useT } from '../utils/i18n';
import { isPhase1Live } from '../utils/batches';
import { getTodayIST } from '../utils/timezone';
import { EventMomoReturnsCard } from './events/EventMomoReturnsCard';
import { useStockRequests, type StockRequestsProps } from './stock/useStockRequests';
import { StoreRequestForm } from './stock/StoreRequestForm';
import { RequestStatusCard } from './stock/RequestStatusCard';
import { RequestDetailBody } from './stock/RequestDetail';
import { ProductionQueue, MomoTotalsToday, RequestRow } from './stock/ProductionQueue';
import { RequestSheet } from './stock/RequestSheet';
import { AllRequests, RequestOversight } from './stock/RequestHistory';
import { StoreStockOnHand, StockJobs } from './stock/StockStatusSection';
import { RequestDialogs } from './stock/RequestDialogs';
import { ListGroup } from './ui/list-row';
import { StickyActions, StockPage } from './stock/stockShared';

type ProductionRequestsProps = StockRequestsProps;

function StoreRequestScreen({ vm }: { vm: ReturnType<typeof useStockRequests> }) {
  const { t, lang } = useT();
  const { requestDate, setRequestDate, myStoreRequests, lastRequest, handleRepeatLastRequest, handleSubmitRequest, submitting, setSelectedRecentRequest, finishedProducts, context, setReceivingRequest, handleStatusUpdate, updatingRequestId } = vm;
  // The latest request already sent for the chosen day.
  const sent = React.useMemo(
    () => myStoreRequests.find((r) => r.requestDate === requestDate) || null,
    [myStoreRequests, requestDate],
  );
  const [sendAnother, setSendAnother] = React.useState(false);
  React.useEffect(() => setSendAnother(false), [requestDate]);
  const showForm = !sent || sendAnother;
  const onTheWay = !!sent && (sent.status === 'shipped' || sent.status === 'partially-shipped');
  const keys = finishedProducts.map((p) => p.camelKey);
  const products = finishedProducts.map(({ camelKey, label }) => ({ camelKey, label }));

  return (
    <>
      <RequestStatusCard requestDate={requestDate} onRequestDateChange={setRequestDate} request={sent} />

      {showForm ? (
        <StoreRequestForm vm={vm} />
      ) : (
        <section className="flex flex-col gap-3">
          <RequestDetailBody request={sent!} products={products} accessToken={context.user?.accessToken || ''} onOpenSlip={() => vm.setSlipRequest(sent!)} />
          <Button variant="secondary" onClick={() => setSendAnother(true)}>{t('stock.req.sendAnother')}</Button>
        </section>
      )}

      {myStoreRequests.length > 0 && (
        <ListGroup title={t('stock.req.recent')}>
          {myStoreRequests.slice(0, 3).map((r) => (
            <RequestRow key={r.id} request={r} keys={keys} showStore={false} onOpen={() => setSelectedRecentRequest(r)} />
          ))}
        </ListGroup>
      )}

      <StoreStockOnHand vm={vm} />
      <StockJobs vm={vm} />
      <AllRequests vm={vm} />

      {showForm ? (
        <StickyActions>
          <Button variant="secondary" size="lg" disabled={!lastRequest} onClick={handleRepeatLastRequest}>{t('request.copyYesterday')}</Button>
          <Button size="lg" className="flex-1" leadingIcon={<Send />} loading={submitting} onClick={() => handleSubmitRequest()}>{t('request.send')}</Button>
        </StickyActions>
      ) : onTheWay ? (
        <StickyActions>
          {isPhase1Live(getTodayIST()) ? (
            <Button size="lg" className="flex-1" leadingIcon={<PackageCheck />} onClick={() => setReceivingRequest(sent)}>{t('stock.req.receiveCount')}</Button>
          ) : (
            <Button size="lg" className="flex-1" loading={updatingRequestId === sent!.id} onClick={() => handleStatusUpdate(sent!.id, sent!.status === 'partially-shipped' ? 'partially-delivered' : 'delivered')}>
              {t('stock.req.confirmDelivery')}
            </Button>
          )}
        </StickyActions>
      ) : null}
    </>
  );
}

export function ProductionRequests(props: ProductionRequestsProps) {
  const vm = useStockRequests(props);
  const { t, lang } = useT();
  const { loading, loadError, isStoreIncharge, isProductionHead, isOperationsHead, isClusterHead, canViewMomoTypeReport, highlightRequestId, requests, setSelectedRecentRequest, loadRequests } = vm;
  const isManager = isOperationsHead || isClusterHead;

  // A notification link (highlight=<request id>) opens that request's sheet once it has loaded.
  const opened = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!highlightRequestId || loading || opened.current === highlightRequestId) return;
    const target = requests.find((r) => r.id === highlightRequestId);
    if (target) {
      opened.current = highlightRequestId;
      setSelectedRecentRequest(target);
    }
  }, [highlightRequestId, loading, requests, setSelectedRecentRequest]);

  if (loading) {
    return (
      <StockPage className="px-5 sm:px-4">
        <div className="rounded-lg border border-border bg-surface p-4"><SkeletonText lines={3} /></div>
        <SkeletonListRows count={6} leading={isStoreIncharge ? 'none' : 'icon'} />
      </StockPage>
    );
  }

  return (
    // The Stock tab wraps this screen in 12 px side padding; 4 more here makes the 16 px gutter.
    <StockPage wide={!isStoreIncharge} lang={lang} className="px-1 py-0 sm:px-0 lg:px-0 lg:py-0">
      {loadError && requests.length === 0 && <ErrorState body={loadError} onRetry={() => loadRequests()} />}

      {isStoreIncharge ? (
        <StoreRequestScreen vm={vm} />
      ) : (
        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:items-start">
          <div className="flex min-w-0 flex-col gap-6">
            {(isProductionHead || isManager) && <EventMomoReturnsCard />}
            <ProductionQueue vm={vm} />
            {isManager && <RequestOversight vm={vm} />}
          </div>
          <div className="flex min-w-0 flex-col gap-6">
            <MomoTotalsToday vm={vm} />
            <StoreStockOnHand vm={vm} />
            <StockJobs vm={vm} />
            <AllRequests vm={vm} />
          </div>
        </div>
      )}

      <RequestSheet vm={vm} />
      <RequestDialogs vm={vm} />
    </StockPage>
  );
}
