// The store incharge's request form: Bunny's fill (momos from the store's freezer and the forecast,
// sauces and supplies from how often they're asked for), momos in pieces (whole bags of 50 from
// Phase 1 go-live), then sauces, kitchen supplies, utilities and notes. Sending happens from the screen's sticky bar (ProductionRequests.tsx).
import * as React from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '../ui/button';
import { Callout } from '../ui/callout';
import { Field } from '../ui/field';
import { ListGroup, ListRow } from '../ui/list-row';
import { NumberStepper } from '../ui/number-stepper';
import { StatusChip } from '../ui/status-chip';
import { Textarea } from '../ui/textarea';
import { ResponsiveModal } from '../ui/responsive-modal';
import { useT } from '../../utils/i18n';
import { bagSize, isPhase1Live, roundUpToBags } from '../../utils/batches';
import type { StockRequestsVM } from './useStockRequests';
import { CollapsibleCard, MultiChips, QuantityStepper, bagsText, dayLabel, formatCount, momoName } from './stockShared';

const oneDecimal = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 1 });

export function StoreRequestForm({ vm }: { vm: StockRequestsVM }) {
  const { t, lang } = useT();
  const {
    finishedProducts, momoQuantities, setMomoQuantities, requestDate, currentStockEstimate,
    kitchenUtilityItems, kitchenUtilities, setKitchenUtilities, sauceItems, sauces, setSauces, utilityItems, utilities, setUtilities,
    showKitchenUtilities, setShowKitchenUtilities, showSauces, setShowSauces, showUtilitiesSection, setShowUtilitiesSection,
    notes, setNotes, suggestion, suggesting, handleSuggest,
  } = vm;
  const [howOpen, setHowOpen] = React.useState(false);
  const wholeBags = isPhase1Live(requestDate);
  const sauceCount = Object.keys(sauces).length;
  const kitchenCount = Object.keys(kitchenUtilities).length;
  const utilityCount = Object.keys(utilities).length;
  const suggestionDay = suggestion ? dayLabel(lang, suggestion.day.date) : dayLabel(lang, requestDate);

  const setMomo = (camelKey: string, pieces: number) => {
    // Whole bags from Phase 1: a typed number rounds up to the next bag, as it did on leaving the box.
    const next = wholeBags ? roundUpToBags(pieces, camelKey) : pieces;
    setMomoQuantities((prev) => ({ ...prev, [camelKey]: next }));
  };

  return (
    <div className="flex flex-col gap-6">
      {suggestion ? (
        <Callout
          icon={<img src="/bunny-logo.png" alt="" />}
          title={t('stock.req.bunnyFilledTitle', { day: suggestionDay })}
          action={<Button variant="link" size="sm" onClick={() => setHowOpen(true)}>{t('stock.req.howWorkedOut')}</Button>}
        >
          {t('stock.req.bunnyFilledBody')}
          {suggestion.supplies.length > 0 && ` ${t('stock.req.bunnyFilledSupplies', { n: suggestion.supplies.length })}`}
        </Callout>
      ) : (
        <Callout
          icon={<img src="/bunny-logo.png" alt="" />}
          title={t('stock.req.bunnyTitle')}
          action={
            <Button variant="secondary" size="sm" leadingIcon={<Sparkles />} loading={suggesting} onClick={handleSuggest}>
              {t('stock.req.bunnyFill')}
            </Button>
          }
        >
          {t('stock.req.bunnyBody', { day: suggestionDay })}
        </Callout>
      )}

      <ListGroup overline={t('stock.req.momos')} footer={wholeBags ? t('stock.req.wholeBags') : undefined}>
        {finishedProducts.map(({ camelKey, label }) => {
          const current = momoQuantities[camelKey] || 0;
          const have = currentStockEstimate[camelKey] ?? 0;
          const step = wholeBags ? bagSize(camelKey) : camelKey === 'chicken' ? 30 : 15;
          const name = momoName(lang, camelKey, label);
          // After Bunny's fill: what the store has by Bunny's count, and why a slow type got no bag.
          const row = suggestion?.rows.find((r) => r.key === camelKey);
          const sub = [
            row ? t('stock.req.storeHas', { n: formatCount(row.onHand) }) : t('stock.req.leftNow', { n: formatCount(have) }),
            wholeBags ? (current > 0 ? bagsText(lang, current, camelKey) : t('stock.req.bagsOf', { n: step })) : null,
            row?.tooSlow ? t('stock.req.leftOut', { n: formatCount(row.expected) }) : row?.slow && row.daysPerBag ? t('stock.req.bagLasts', { n: oneDecimal(row.daysPerBag) }) : null,
          ].filter(Boolean).join(' · ');
          return (
            <ListRow
              key={camelKey}
              title={name}
              subtitle={sub}
              trailing={<NumberStepper label={name} value={current} step={step} onChange={(n) => setMomo(camelKey, n)} />}
            />
          );
        })}
      </ListGroup>

      <div className="flex flex-col gap-3">
        <CollapsibleCard
          title={t('stock.req.sauces')}
          subtitle={t('stock.req.saucesHint')}
          open={showSauces}
          onOpenChange={setShowSauces}
          chip={sauceCount > 0 ? <StatusChip tone="brand">{t('stock.req.picked', { n: sauceCount })}</StatusChip> : undefined}
        >
          <div className="p-4">
            <MultiChips
              label={t('stock.req.sauces')}
              options={sauceItems}
              value={sauces}
              onToggle={(sauce) => {
                if (sauces[sauce]) {
                  const next = { ...sauces };
                  delete next[sauce];
                  setSauces(next);
                } else {
                  setSauces({ ...sauces, [sauce]: true });
                }
              }}
            />
          </div>
        </CollapsibleCard>

        <CollapsibleCard
          title={t('stock.req.kitchen')}
          subtitle={t('stock.req.kitchenHint')}
          open={showKitchenUtilities}
          onOpenChange={setShowKitchenUtilities}
          chip={kitchenCount > 0 ? <StatusChip tone="brand">{t('stock.req.added', { n: kitchenCount })}</StatusChip> : undefined}
        >
          <div className="[&>*+*]:border-t [&>*+*]:border-border">
            {kitchenUtilityItems.map((item) => {
              const qty = kitchenUtilities[item.name]?.quantity ?? 0;
              const setQty = (quantity: number) => {
                const rounded = Math.max(0, Math.round(quantity * 100) / 100);
                if (rounded > 0) {
                  setKitchenUtilities({ ...kitchenUtilities, [item.name]: { quantity: rounded, unit: item.unit } });
                } else {
                  const next = { ...kitchenUtilities };
                  delete next[item.name];
                  setKitchenUtilities(next);
                }
              };
              return (
                <ListRow
                  key={item.name}
                  density="compact"
                  title={item.name}
                  subtitle={item.unit}
                  trailing={<QuantityStepper label={item.name} value={qty} onChange={setQty} decimals emptyWhenZero />}
                />
              );
            })}
          </div>
        </CollapsibleCard>

        <CollapsibleCard
          title={t('stock.req.utilities')}
          subtitle={t('stock.req.utilitiesHint')}
          open={showUtilitiesSection}
          onOpenChange={setShowUtilitiesSection}
          chip={utilityCount > 0 ? <StatusChip tone="brand">{t('stock.req.added', { n: utilityCount })}</StatusChip> : undefined}
        >
          <div className="[&>*+*]:border-t [&>*+*]:border-border">
            {utilityItems.map((item) => {
              const qty = utilities[item] ?? 0;
              const setQty = (quantity: number) => {
                const rounded = Math.max(0, Math.round(quantity));
                if (rounded > 0) setUtilities({ ...utilities, [item]: rounded });
                else {
                  const next = { ...utilities };
                  delete next[item];
                  setUtilities(next);
                }
              };
              return (
                <ListRow key={item} density="compact" title={item} subtitle={t('stock.pcsUnit')} trailing={<QuantityStepper label={item} value={qty} onChange={setQty} emptyWhenZero />} />
              );
            })}
          </div>
        </CollapsibleCard>
      </div>

      <Field label={t('stock.req.notes')} optional>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder={t('stock.req.notesPlaceholder')} />
      </Field>

      <ResponsiveModal open={howOpen} onOpenChange={setHowOpen} title={t('stock.req.howWorkedOut')} description={suggestion ? dayLabel(lang, suggestion.day.date) : undefined}>
        {suggestion && (
          <div className="flex flex-col gap-3" lang={lang}>
            <p className="text-body-sm text-text-2">
              {t('stock.req.expectedRevenue', { amount: `₹${suggestion.day.revenue.toLocaleString('en-IN')}` })}
              {suggestion.day.event && suggestion.day.event.effect !== 'normal' ? ` · ${suggestion.day.event.name}` : ''}
            </p>
            <div className="overflow-hidden rounded-lg border border-border bg-surface [&>*+*]:border-t [&>*+*]:border-border">
              {suggestion.rows.filter((r) => r.expected > 0 || r.pieces > 0 || r.onHand > 0).map((r) => {
                const label = finishedProducts.find((p) => p.camelKey === r.key)?.label || r.key;
                // Why a type got fewer bags, or none: these run long, so they wrap instead of clipping.
                const notes = [
                  r.tooSlow ? t('stock.req.tooSlowLine', { n: formatCount(r.expected) }) : r.slow && r.daysPerBag ? t('stock.req.slowLine', { n: oneDecimal(r.daysPerBag) }) : null,
                  r.goingOff > 0 ? t('stock.req.goingOff', { n: formatCount(r.goingOff) }) : null,
                ].filter(Boolean);
                return (
                  <div key={r.key} className="flex items-start gap-3 px-4 py-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-body-md font-medium text-text">{momoName(lang, r.key, label)}</span>
                      <span className="text-label text-text-3">
                        {t(r.slow ? 'stock.req.expectedPlain' : 'stock.req.expectedLine', { n: formatCount(r.expected) })} · {t('stock.req.storeHas', { n: formatCount(r.onHand) })}
                      </span>
                      {notes.map((n) => <span key={n} className="text-label text-text-2">{n}</span>)}
                    </div>
                    <span className="num text-body-md font-semibold text-text">{formatCount(r.pieces)}</span>
                  </div>
                );
              })}
            </div>
            {suggestion.supplies.length > 0 && (
              <>
                <p className="text-label font-semibold text-text-2">{t('stock.req.suppliesTitle')}</p>
                <div className="overflow-hidden rounded-lg border border-border bg-surface [&>*+*]:border-t [&>*+*]:border-border">
                  {suggestion.supplies.map((p) => {
                    const why = p.why.kind === 'flag'
                      ? (p.why.by ? t(p.why.level === 'out' ? 'stock.req.supplyOut' : 'stock.req.supplyLow', { name: p.why.by }) : t('stock.req.supplyFlagged'))
                      : t(p.why.everyDays <= 1 ? 'stock.req.supplyDaily' : 'stock.req.supplyDue', { n: p.why.everyDays, day: dayLabel(lang, p.why.last) });
                    return (
                      <ListRow
                        key={`${p.section}:${p.name}`}
                        density="compact"
                        title={p.name}
                        subtitle={why}
                        trailing={p.section === 'sauce' ? undefined : <span className="num text-body-md font-semibold text-text">{formatCount(p.quantity)} {p.unit}</span>}
                      />
                    );
                  })}
                </div>
              </>
            )}
            <p className="text-label text-text-3">{t('stock.req.countDiffers')}</p>
          </div>
        )}
      </ResponsiveModal>
    </div>
  );
}
