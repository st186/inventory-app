// "Ship" for production: momos in whole bags with the batches they come from (ShipDialogBags),
// kitchen supplies and utilities as sent, sauces ticked off, packing details, and the
// responsibility tick. Anything sent short needs a reason. Shown inside the request sheet.
import * as React from 'react';
import { Checkbox } from '../ui/checkbox';
import { Field } from '../ui/field';
import { Input } from '../ui/input';
import { ListGroup } from '../ui/list-row';
import { useT } from '../../utils/i18n';
import { isPhase1Live } from '../../utils/batches';
import { getTodayIST } from '../../utils/timezone';
import { ShipDialogBags, PackingFields } from '../dispatch/ShipDialogBags';
import type { StockRequestsVM } from './useStockRequests';
import { QuantityStepper } from './stockShared';

function ReasonField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const { t } = useT();
  return (
    <Field label={label} required>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={t('stock.ship.reasonPlaceholder')} />
    </Field>
  );
}

export function ShipForm({ vm }: { vm: StockRequestsVM }) {
  const { t, lang } = useT();
  const {
    shippingRequest, finishedProducts, shippedQuantities, setShippedQuantities, shippedSauces, setShippedSauces,
    shippingNotes, setShippingNotes, shippingResponsibility, setShippingResponsibility, dispatchDraft, setDispatchDraft, context, requests,
  } = vm;
  if (!shippingRequest) return null;
  const momoKeys = finishedProducts.map((p) => p.camelKey).filter((k) => k in shippedQuantities);
  const kitchenKeys = Object.keys(shippedQuantities).filter((key) => key.startsWith('kitchenUtility_'));
  const utilityKeys = Object.keys(shippedQuantities).filter((key) => key.startsWith('utility_'));
  const sauces = Object.keys(shippingRequest.sauces || {});
  const showPacking = isPhase1Live(getTodayIST()) && finishedProducts.some((p) => (shippedQuantities[p.camelKey] || 0) > 0);

  return (
    <div className="flex flex-col gap-6" lang={lang}>
      {momoKeys.length > 0 && (
        <ShipDialogBags
          request={shippingRequest}
          momoKeys={momoKeys}
          labels={Object.fromEntries(finishedProducts.map((p) => [p.camelKey, p.label]))}
          shippedQuantities={shippedQuantities}
          setShippedQuantities={setShippedQuantities}
          shippingNotes={shippingNotes}
          setShippingNotes={setShippingNotes}
          draft={dispatchDraft}
          setDraft={setDispatchDraft}
          productionData={context.productionData || []}
          allRequests={requests}
        />
      )}

      {kitchenKeys.length > 0 && (
        <ListGroup overline={t('stock.req.kitchen')}>
          {kitchenKeys.map((key) => {
            const name = key.replace('kitchenUtility_', '');
            const asked = shippingRequest.kitchenUtilities?.[name]?.quantity || 0;
            const unit = shippingRequest.kitchenUtilities?.[name]?.unit || '';
            const qty = shippedQuantities[key] || 0;
            return (
              <div key={key} className="flex flex-col gap-3 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-body-md font-medium text-text">{name}</span>
                    <span className="text-label text-text-3">{t('stock.ship.asked', { n: `${asked} ${unit}` })}</span>
                  </span>
                  <QuantityStepper label={name} value={qty} decimals onChange={(n) => setShippedQuantities({ ...shippedQuantities, [key]: n })} />
                </div>
                {qty !== asked && <ReasonField label={t('stock.ship.reason')} value={shippingNotes[key] || ''} onChange={(v) => setShippingNotes({ ...shippingNotes, [key]: v })} />}
              </div>
            );
          })}
        </ListGroup>
      )}

      {utilityKeys.length > 0 && (
        <ListGroup overline={t('stock.req.utilities')}>
          {utilityKeys.map((key) => {
            const name = key.replace('utility_', '');
            const asked = shippingRequest.utilities?.[name] || 0;
            const qty = shippedQuantities[key] || 0;
            return (
              <div key={key} className="flex flex-col gap-3 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-body-md font-medium text-text">{name}</span>
                    <span className="text-label text-text-3">{t('stock.ship.asked', { n: `${asked} ${t('stock.pcsUnit')}` })}</span>
                  </span>
                  <QuantityStepper label={name} value={qty} onChange={(n) => setShippedQuantities({ ...shippedQuantities, [key]: Math.round(n) })} />
                </div>
                {qty !== asked && <ReasonField label={t('stock.ship.reason')} value={shippingNotes[key] || ''} onChange={(v) => setShippingNotes({ ...shippingNotes, [key]: v })} />}
              </div>
            );
          })}
        </ListGroup>
      )}

      {sauces.length > 0 && (
        <ListGroup overline={t('stock.req.sauces')} footer={t('stock.ship.saucesHint')}>
          {sauces.map((sauce) => {
            const included = shippedSauces[sauce] ?? true;
            const notesKey = `sauce_${sauce}`;
            const id = `ship-sauce-${sauce.replace(/\W+/g, '-')}`;
            return (
              <div key={sauce} className="flex flex-col gap-3 px-4 py-2">
                <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3">
                  <Checkbox id={id} checked={included} onCheckedChange={(v) => setShippedSauces({ ...shippedSauces, [sauce]: v === true })} />
                  <span className={`text-body-md ${included ? 'text-text' : 'text-danger'}`}>{sauce}</span>
                </label>
                {!included && <ReasonField label={t('stock.ship.sauceReason')} value={shippingNotes[notesKey] || ''} onChange={(v) => setShippingNotes({ ...shippingNotes, [notesKey]: v })} />}
              </div>
            );
          })}
        </ListGroup>
      )}

      {showPacking && <PackingFields draft={dispatchDraft} setDraft={setDispatchDraft} />}

      <label htmlFor="ship-responsible" className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface px-4 py-3">
        <Checkbox id="ship-responsible" checked={shippingResponsibility} onCheckedChange={(v) => setShippingResponsibility(v === true)} className="mt-0.5" />
        <span className="text-body-sm text-text">
          <span className="font-semibold">{t('stock.ship.responsibleTitle')}</span> {t('stock.ship.responsibleBody')}
        </span>
      </label>
    </div>
  );
}
