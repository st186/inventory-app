// The stock request screen's sheets that aren't the request sheet itself: the review before a
// request goes out, stock count, alert levels, count reports, wastage, plate size and the
// store's receive and count. Only one opens at a time.
import * as React from 'react';
import { Send } from 'lucide-react';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Field } from '../ui/field';
import { ListGroup, ListRow } from '../ui/list-row';
import { NumberStepper } from '../ui/number-stepper';
import { ResponsiveModal } from '../ui/responsive-modal';
import { useT } from '../../utils/i18n';
import { MonthlyStockRecalibration } from '../MonthlyStockRecalibration';
import { StockThresholdSettings } from '../StockThresholdSettings';
import { RecalibrationReports } from '../RecalibrationReports';
import { StockWastageModal } from '../StockWastageModal';
import { ReceiveDeliveryDialog } from '../dispatch/ReceiveDeliveryDialog';
import type { StockRequestsVM } from './useStockRequests';
import { dayLabel, formatCount, momoName } from './stockShared';

/** "Check before sending": the day, everything on the request, and a tick before it goes. */
export function ReviewRequestSheet({ vm }: { vm: StockRequestsVM }) {
  const { t, lang } = useT();
  const {
    showSubmitConfirm, setShowSubmitConfirm, submitConfirmChecked, setSubmitConfirmChecked, finishedProducts, momoQuantities, kitchenUtilities,
    sauces, utilities, notes, requestDate, storeDisplayName, submitting, handleConfirmAndSubmit,
  } = vm;
  const momoRows = finishedProducts.filter(({ camelKey }) => (momoQuantities[camelKey] || 0) > 0);
  const total = momoRows.reduce((sum, { camelKey }) => sum + (momoQuantities[camelKey] || 0), 0);
  const kitchen = Object.entries(kitchenUtilities);
  const sauceNames = Object.keys(sauces).filter((s) => sauces[s]);
  const utilityRows = Object.entries(utilities);
  const none = <ListRow density="compact" title={t('stock.req.none')} muted />;

  return (
    <ResponsiveModal
      open={showSubmitConfirm}
      onOpenChange={setShowSubmitConfirm}
      title={t('stock.req.reviewTitle')}
      description={[dayLabel(lang, requestDate), storeDisplayName].filter(Boolean).join(' · ')}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={() => setShowSubmitConfirm(false)}>{t('common.back')}</Button>
          <Button size="lg" className="flex-1" leadingIcon={<Send />} disabled={!submitConfirmChecked} loading={submitting} onClick={handleConfirmAndSubmit}>
            {t('request.send')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5" lang={lang}>
        <ListGroup overline={t('stock.detail.momos')} footer={<span className="num">{t('stock.detail.totalPieces', { n: formatCount(total) })}</span>}>
          {momoRows.length === 0 ? none : momoRows.map(({ camelKey, label }) => (
            <ListRow key={camelKey} density="compact" title={momoName(lang, camelKey, label)} trailing={<span className="num text-body-md font-semibold text-text">{formatCount(momoQuantities[camelKey])}</span>} />
          ))}
        </ListGroup>
        <ListGroup overline={t('stock.req.kitchen')}>
          {kitchen.length === 0 ? none : kitchen.map(([name, v]) => (
            <ListRow key={name} density="compact" title={name} trailing={<span className="num text-body-sm font-semibold text-text">{v.quantity} {v.unit}</span>} />
          ))}
        </ListGroup>
        <ListGroup overline={t('stock.req.sauces')}>
          {sauceNames.length === 0 ? none : <ListRow density="compact" title={sauceNames.join(', ')} />}
        </ListGroup>
        <ListGroup overline={t('stock.req.utilities')}>
          {utilityRows.length === 0 ? none : utilityRows.map(([name, qty]) => (
            <ListRow key={name} density="compact" title={name} trailing={<span className="num text-body-sm font-semibold text-text">{qty} {t('stock.pcsUnit')}</span>} />
          ))}
        </ListGroup>
        {notes && (
          <section>
            <h3 className="overline-label mx-1 mb-2">{t('stock.req.notes')}</h3>
            <p className="rounded-lg border border-border bg-surface px-4 py-3 text-body-sm text-text">{notes}</p>
          </section>
        )}
        <label htmlFor="review-confirm" className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface px-4 py-3">
          <Checkbox id="review-confirm" checked={submitConfirmChecked} onCheckedChange={(v) => setSubmitConfirmChecked(v === true)} className="mt-0.5" />
          <span className="text-body-sm text-text">{t('stock.req.reviewConfirm')}</span>
        </label>
      </div>
    </ResponsiveModal>
  );
}

export function RequestDialogs({ vm }: { vm: StockRequestsVM }) {
  const {
    context, singleScopedStoreId, showStoreRecalibration, setShowStoreRecalibration, showThresholdSettings, setShowThresholdSettings, stockThresholds,
    setStockThresholds, showRecalibrationReports, setShowRecalibrationReports, showStockWastageModal, setShowStockWastageModal, finishedProducts,
    showPlateConfigModal, setShowPlateConfigModal, momosPerPlate, setMomosPerPlate, receivingRequest, setReceivingRequest, loadRequests,
  } = vm;

  return (
    <>
      <ReviewRequestSheet vm={vm} />

      {showStoreRecalibration && (
        <MonthlyStockRecalibration
          context={context}
          selectedStoreId={singleScopedStoreId}
          onClose={() => setShowStoreRecalibration(false)}
          isProductionHouse={false}
          isStoreFinishedProducts={true}
        />
      )}

      {showThresholdSettings && (
        <StockThresholdSettings
          storeId={singleScopedStoreId || ''}
          accessToken={context.user?.accessToken || ''}
          thresholds={stockThresholds}
          onClose={() => setShowThresholdSettings(false)}
          onSave={(next) => {
            setStockThresholds(next);
            setShowThresholdSettings(false);
          }}
        />
      )}

      {/* Count reports - RecalibrationReports is a screen section (Analytics shows it as one); here it sits in a sheet. */}
      <ResponsiveModal open={showRecalibrationReports} onOpenChange={setShowRecalibrationReports} title="Stock counts" size="detail">
        {showRecalibrationReports && <RecalibrationReports context={context} selectedStoreId={singleScopedStoreId} locationType="store" />}
      </ResponsiveModal>

      {showStockWastageModal && singleScopedStoreId && (
        <StockWastageModal context={context} storeId={singleScopedStoreId} finishedProducts={finishedProducts} onClose={() => setShowStockWastageModal(false)} />
      )}

      <ResponsiveModal
        open={showPlateConfigModal}
        onOpenChange={setShowPlateConfigModal}
        title="Plate size"
        description="Stock shows in pieces and plates"
        footer={<Button size="lg" className="flex-1" onClick={() => setShowPlateConfigModal(false)}>Done</Button>}
      >
        <div className="flex flex-col gap-4">
          <Field label="Momos in a plate" helper={`170 momos show as 170 pcs / ${Math.round(170 / (momosPerPlate || 6))} plates`}>
            <NumberStepper
              label="Momos in a plate"
              value={momosPerPlate}
              min={1}
              max={20}
              onChange={(value) => {
                setMomosPerPlate(value);
                localStorage.setItem('momosPerPlate', value.toString());
              }}
            />
          </Field>
        </div>
      </ResponsiveModal>

      {receivingRequest && (
        <ReceiveDeliveryDialog
          request={receivingRequest}
          products={finishedProducts}
          accessToken={context.user?.accessToken || ''}
          onClose={() => setReceivingRequest(null)}
          onReceived={async () => {
            setReceivingRequest(null);
            await loadRequests();
          }}
        />
      )}
    </>
  );
}
