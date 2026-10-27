// One sheet for a request, whose content swaps instead of stacking sheets: the request's detail
// (with the next step for whoever is looking), "Ship" for production, then the dispatch slip
// with "Call a rider".
import * as React from 'react';
import { Bike, FileText, PackageCheck, Truck } from 'lucide-react';
import { Button } from '../ui/button';
import { ResponsiveModal } from '../ui/responsive-modal';
import { useT } from '../../utils/i18n';
import type { ProductionRequest } from '../../utils/api';
import { isPhase1Live } from '../../utils/batches';
import { getTodayIST } from '../../utils/timezone';
import { DispatchSlipBody, useSlipActions } from '../dispatch/DispatchSlip';
import type { StockRequestsVM } from './useStockRequests';
import { RequestDetailBody } from './RequestDetail';
import { ShipForm } from './ShipForm';
import { RequestStatusChip, dayLabel } from './stockShared';

export function RequestSheet({ vm }: { vm: StockRequestsVM }) {
  const { t, lang } = useT();
  const {
    selectedRecentRequest, setSelectedRecentRequest, showShippingDialog, setShowShippingDialog, shippingRequest, slipRequest, setSlipRequest,
    requests, finishedProducts, context, isProductionHead, isStoreIncharge, isOperationsHead, isClusterHead, updatingRequestId,
    handleStatusUpdate, openShippingDialog, handleShipRequest, shippingResponsibility, setReceivingRequest,
  } = vm;

  const mode: 'ship' | 'slip' | 'detail' | null = showShippingDialog && shippingRequest ? 'ship' : slipRequest ? 'slip' : selectedRecentRequest ? 'detail' : null;
  const live = (r: ProductionRequest | null) => (r ? requests.find((x) => x.id === r.id) || r : null);
  const current = mode === 'ship' ? shippingRequest : mode === 'slip' ? slipRequest : live(selectedRecentRequest);
  // Keep the last request on screen while the sheet slides away.
  const last = React.useRef<ProductionRequest | null>(null);
  if (current) last.current = current;
  const request = current || last.current;
  const products = finishedProducts.map(({ camelKey, label }) => ({ camelKey, label }));
  const slip = useSlipActions(request, products);
  const busy = !!request && updatingRequestId === request.id;
  const ridersHref = isProductionHead ? '#/production/riders' : '#/stock/riders';
  const canCallRider = isProductionHead || isOperationsHead || isClusterHead;

  const close = () => {
    setShowShippingDialog(false);
    setSlipRequest(null);
    setSelectedRecentRequest(null);
  };

  let footer: React.ReactNode = null;
  if (request && mode === 'ship') {
    footer = (
      <Button size="lg" className="flex-1" leadingIcon={<Truck />} disabled={!shippingResponsibility} onClick={handleShipRequest}>
        {t('stock.ship.ship')}
      </Button>
    );
  } else if (request && mode === 'slip') {
    footer = (
      <>
        <Button variant="secondary" size="lg" className="flex-1" onClick={slip.copy}>{t('stock.slip.copy')}</Button>
        {canCallRider ? (
          <Button asChild size="lg" className="flex-1">
            <a href={ridersHref} onClick={close}><Bike className="size-5" aria-hidden="true" />{t('stock.slip.callRider')}</a>
          </Button>
        ) : (
          <Button asChild size="lg" className="flex-1">
            <a href={slip.whatsappHref} target="_blank" rel="noopener noreferrer">{t('stock.slip.whatsapp')}</a>
          </Button>
        )}
      </>
    );
  } else if (request && mode === 'detail') {
    const s = request.status;
    const step = isProductionHead
      ? s === 'pending' ? { label: t('stock.queue.accept'), run: () => handleStatusUpdate(request.id, 'accepted') }
        : s === 'accepted' ? { label: t('stock.queue.startPacking'), run: () => handleStatusUpdate(request.id, 'in-preparation') }
          : s === 'in-preparation' ? { label: t('stock.queue.markPacked'), run: () => handleStatusUpdate(request.id, 'prepared') }
            : s === 'prepared' ? { label: t('stock.ship.ship'), run: () => openShippingDialog(request) }
              : null
      : null;
    const receive = isStoreIncharge && (s === 'shipped' || s === 'partially-shipped');
    footer = (
      <>
        {request.dispatch && (
          <Button variant="secondary" size="lg" className="flex-1" leadingIcon={<FileText />} onClick={() => setSlipRequest(request)}>
            {t('stock.slip.title')}
          </Button>
        )}
        {step && (
          <Button size="lg" className="flex-1" loading={busy} onClick={step.run}>{step.label}</Button>
        )}
        {receive && (isPhase1Live(getTodayIST()) ? (
          <Button size="lg" className="flex-1" leadingIcon={<PackageCheck />} onClick={() => { close(); setReceivingRequest(request); }}>
            {t('stock.req.receiveCount')}
          </Button>
        ) : (
          <Button size="lg" className="flex-1" loading={busy} onClick={() => handleStatusUpdate(request.id, s === 'partially-shipped' ? 'partially-delivered' : 'delivered')}>
            {t('stock.req.confirmDelivery')}
          </Button>
        ))}
        {!request.dispatch && !step && !receive && (
          <Button variant="secondary" size="lg" className="flex-1" onClick={close}>{t('common.close')}</Button>
        )}
      </>
    );
  }

  const who = request ? `${request.storeName || t('stock.queue.unknownStore')}${(request as any).eventId ? ` · ${t('event.event')}` : ''}` : '';
  const title = mode === 'ship' ? t('stock.ship.title') : mode === 'slip' ? t('stock.slip.title') : request ? t('stock.detail.title', { date: dayLabel(lang, request.requestDate) }) : '';

  return (
    <ResponsiveModal
      open={mode !== null}
      onOpenChange={(o) => { if (!o) close(); }}
      title={title}
      description={request ? who : undefined}
      size="detail"
      onBack={mode === 'ship' && selectedRecentRequest ? () => setShowShippingDialog(false) : mode === 'slip' && selectedRecentRequest ? () => setSlipRequest(null) : undefined}
      headerActions={request && mode === 'detail' ? <span className="mr-1"><RequestStatusChip status={request.status} size="sm" /></span> : undefined}
      footer={footer}
    >
      {request && mode === 'ship' && <ShipForm vm={vm} />}
      {request && mode === 'slip' && <DispatchSlipBody request={request} products={products} />}
      {request && mode === 'detail' && (
        <RequestDetailBody request={request} products={products} accessToken={context.user?.accessToken || ''} onOpenSlip={() => setSlipRequest(request)} />
      )}
    </ResponsiveModal>
  );
}
