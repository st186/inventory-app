// What one stock request asked for and what happened to it: momos (asked vs sent once shipped),
// kitchen supplies, utilities, sauces, notes, the dispatch and the store's count, and the
// timeline. The body of the request sheet for the store, production and managers alike.
import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Callout } from '../ui/callout';
import { ListGroup, ListRow } from '../ui/list-row';
import { StatusChip } from '../ui/status-chip';
import { useT } from '../../utils/i18n';
import type { ProductionRequest } from '../../utils/api';
import { DispatchDetails } from '../dispatch/DispatchSlip';
import { ReceiptSummary } from '../dispatch/ReceiveDeliveryDialog';
import { KeyValue, formatCount, momoName, requestTotalPieces, requestedQty, whenLabel } from './stockShared';

export type ProductLabel = { camelKey: string; label: string };

/** Asked vs sent for one line, once the request has been through the ship step. */
function SentFigure({ asked, sent, unit }: { asked: number; sent?: number; unit?: string }) {
  const { t } = useT();
  if (sent === undefined || sent === asked) {
    return <span className="num text-body-md font-semibold text-text">{formatCount(asked)}{unit ? ` ${unit}` : ''}</span>;
  }
  const short = sent < asked;
  return (
    <span className="flex flex-col items-end">
      <span className={`num text-body-md font-semibold ${short ? 'text-danger' : 'text-text'}`}>{t('stock.detail.sentOfAsked', { sent: formatCount(sent), asked: formatCount(asked) })}{unit ? ` ${unit}` : ''}</span>
      {short && <span className="text-caption text-danger">{t('stock.detail.shortBy', { n: formatCount(asked - sent) })}</span>}
    </span>
  );
}

export function RequestDetailBody({
  request,
  products,
  accessToken,
  onOpenSlip,
}: {
  request: ProductionRequest;
  products: ProductLabel[];
  accessToken: string;
  onOpenSlip?: () => void;
}) {
  const { t, lang } = useT();
  const shipped = !!request.shippedQuantities;
  const momoRows = products.filter(({ camelKey }) => requestedQty(request, camelKey) > 0);
  const total = requestTotalPieces(request, products.map((p) => p.camelKey));
  const kitchen = Object.entries(request.kitchenUtilities || {});
  const utilities = Object.entries(request.utilities || {});
  const sauces = Object.keys(request.sauces || {}).filter((s) => (request.sauces as any)?.[s]);
  // Sauce reasons show beside the sauce itself.
  const notesFromProduction = Object.entries(request.shippingNotes || {}).filter(([key]) => !key.startsWith('sauce_'));
  const timeline = [
    { label: t('status.sent'), at: request.createdAt },
    { label: t('stock.status.accepted'), at: request.acceptedAt },
    { label: t('status.packed'), at: request.preparedAt },
    { label: t('status.onTheWay'), at: request.shippedAt },
    { label: t('status.received'), at: request.deliveredAt },
  ].filter((step) => step.at);

  return (
    <div className="flex flex-col gap-5" lang={lang}>
      <ListGroup overline={t('stock.detail.momos')} footer={<span className="num">{t('stock.detail.totalPieces', { n: formatCount(total) })}</span>}>
        {momoRows.length === 0 && <ListRow title={t('stock.req.none')} muted />}
        {momoRows.map(({ camelKey, label }) => (
          <ListRow
            key={camelKey}
            density="compact"
            title={momoName(lang, camelKey, label)}
            trailing={<SentFigure asked={requestedQty(request, camelKey)} sent={shipped ? request.shippedQuantities?.[camelKey] ?? 0 : undefined} />}
          />
        ))}
      </ListGroup>

      {kitchen.length > 0 && (
        <ListGroup overline={t('stock.req.kitchen')}>
          {kitchen.map(([name, data]) => (
            <ListRow
              key={name}
              density="compact"
              title={name}
              trailing={<SentFigure asked={data.quantity} sent={shipped ? request.shippedQuantities?.[`kitchenUtility_${name}`] ?? 0 : undefined} unit={data.unit} />}
            />
          ))}
        </ListGroup>
      )}

      {utilities.length > 0 && (
        <ListGroup overline={t('stock.req.utilities')}>
          {utilities.map(([name, qty]) => (
            <ListRow
              key={name}
              density="compact"
              title={name}
              trailing={<SentFigure asked={qty} sent={shipped ? request.shippedQuantities?.[`utility_${name}`] ?? 0 : undefined} unit={t('stock.pcsUnit')} />}
            />
          ))}
        </ListGroup>
      )}

      {sauces.length > 0 && (
        <ListGroup overline={t('stock.req.sauces')}>
          {sauces.map((sauce) => {
            // Only meaningful once shipped - before that a sauce is simply asked for.
            const wasSent = !shipped || (request.shippedSauces ? request.shippedSauces[sauce] : true);
            const reason = request.shippingNotes?.[`sauce_${sauce}`];
            return (
              <ListRow
                key={sauce}
                density="compact"
                title={sauce}
                subtitle={!wasSent && reason ? t('stock.detail.reason', { reason }) : undefined}
                trailing={shipped ? <StatusChip tone={wasSent ? 'success' : 'danger'}>{wasSent ? t('stock.detail.sauceSent') : t('stock.detail.notSent')}</StatusChip> : undefined}
              />
            );
          })}
        </ListGroup>
      )}

      {request.notes && (
        <section className="flex flex-col gap-1">
          <h3 className="overline-label mx-1">{t('stock.req.notes')}</h3>
          <p className="rounded-lg border border-border bg-surface px-4 py-3 text-body-sm text-text">{request.notes}</p>
        </section>
      )}

      {notesFromProduction.length > 0 && (
        <Callout tone="warning" icon={AlertTriangle} title={t('stock.detail.productionNotes')}>
          {notesFromProduction.map(([key, note]) => (
            <span key={key} className="block">
              <span className="font-medium">{key.replace(/^kitchenUtility_|^utility_/, '').replace(/_/g, ' ')}:</span> {note}
            </span>
          ))}
        </Callout>
      )}

      <DispatchDetails request={request} products={products} onOpenSlip={onOpenSlip || (() => undefined)} />
      <ReceiptSummary request={request} products={products} accessToken={accessToken} />

      {timeline.length > 0 && (
        <section className="flex flex-col">
          <h3 className="overline-label mx-1 mb-2">{t('stock.detail.timeline')}</h3>
          <div className="rounded-lg border border-border bg-surface px-4 py-1.5">
            {timeline.map((step) => (
              <KeyValue key={step.label} label={step.label} value={whenLabel(lang, step.at)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
