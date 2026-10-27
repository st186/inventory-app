// The two production settings sheets Insights > Production opens (operations manager and owner):
// stock alert levels per momo type, and how many momos make a plate. Same state and saves as
// before (alert levels for this visit, plate size remembered on the device), now as sheets.
import { Check } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { Button } from '../../ui/button';
import { Field } from '../../ui/field';
import { Input } from '../../ui/input';
import { ResponsiveModal } from '../../ui/responsive-modal';
import { StatusChip } from '../../ui/status-chip';
import { type AnalyticsData } from '../useAnalyticsData';

export function StockAlertSheet({ d }: { d: AnalyticsData }) {
  const { context, showStockAlertModal, setShowStockAlertModal, stockAlertThresholds, setStockAlertThresholds, tempStockAlertThresholds, setTempStockAlertThresholds } = d;
  const close = () => {
    setShowStockAlertModal(false);
    setTempStockAlertThresholds({});
  };
  const momoTypes = (context.inventoryItems?.filter((item) => item.category === 'finished_product' && item.isActive) || []).map((item) => ({
    camelKey: item.name.replace(/_([a-z])/g, (g) => g[1].toUpperCase()),
    label: item.displayName,
  }));
  return (
    <ResponsiveModal
      open={showStockAlertModal}
      onOpenChange={(open) => { if (!open) close(); }}
      title="Stock alert levels"
      description="When stock falls below these levels (in plates), the stock cards show a coloured alert."
      size="detail"
      dirty={Object.keys(tempStockAlertThresholds).length > 0}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={close}>Cancel</Button>
          <Button
            size="lg"
            className="flex-1"
            leadingIcon={<Check />}
            onClick={() => {
              setStockAlertThresholds(tempStockAlertThresholds);
              setShowStockAlertModal(false);
              setTempStockAlertThresholds({});
              toast.success('Stock alert levels saved');
            }}
          >
            Save levels
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <StatusChip tone="success">High: above the high level</StatusChip>
          <StatusChip tone="warning">Medium: between medium and high</StatusChip>
          <StatusChip tone="brand">Low: between low and medium</StatusChip>
          <StatusChip tone="danger">Critical: below low, or none</StatusChip>
        </div>
        {momoTypes.map(({ camelKey, label }) => {
          const current = tempStockAlertThresholds[camelKey] ?? stockAlertThresholds[camelKey] ?? { high: 600, medium: 300, low: 150 };
          const set = (level: 'high' | 'medium' | 'low', value: number) =>
            setTempStockAlertThresholds({ ...tempStockAlertThresholds, [camelKey]: { ...current, [level]: value } });
          return (
            <section key={camelKey} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
              <h3 className="text-subtitle font-semibold text-text">{label}</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="High (plates)">
                  <Input type="number" inputMode="numeric" value={current.high} onChange={(e) => set('high', Number(e.target.value))} placeholder="e.g. 1200" />
                </Field>
                <Field label="Medium (plates)">
                  <Input type="number" inputMode="numeric" value={current.medium} onChange={(e) => set('medium', Number(e.target.value))} placeholder="e.g. 600" />
                </Field>
                <Field label="Low (plates)">
                  <Input type="number" inputMode="numeric" value={current.low} onChange={(e) => set('low', Number(e.target.value))} placeholder="e.g. 300" />
                </Field>
              </div>
            </section>
          );
        })}
      </div>
    </ResponsiveModal>
  );
}

export function PlateSettingsSheet({ d }: { d: AnalyticsData }) {
  const { showPlateSettingsModal, setShowPlateSettingsModal, momosPerPlate, setMomosPerPlate, tempMomosPerPlate, setTempMomosPerPlate } = d;
  const close = () => {
    setShowPlateSettingsModal(false);
    setTempMomosPerPlate(momosPerPlate);
  };
  return (
    <ResponsiveModal
      open={showPlateSettingsModal}
      onOpenChange={(open) => { if (!open) close(); }}
      title="Momos per plate"
      description="Stock shows as pieces and plates, e.g. 170 pcs / 28 plates at 6 a plate."
      dirty={tempMomosPerPlate !== momosPerPlate}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={close}>Cancel</Button>
          <Button
            size="lg"
            className="flex-1"
            leadingIcon={<Check />}
            onClick={() => {
              setMomosPerPlate(tempMomosPerPlate);
              localStorage.setItem('momosPerPlate', tempMomosPerPlate.toString());
              setShowPlateSettingsModal(false);
              toast.success(`Plate size saved: ${tempMomosPerPlate} momos a plate`);
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Momos per plate" helper="A number from 1 to 20">
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            value={tempMomosPerPlate}
            onChange={(e) => {
              const value = Number(e.target.value);
              if (value >= 1 && value <= 20) setTempMomosPerPlate(value);
            }}
            className="num text-center text-title font-semibold"
          />
        </Field>
        <div className="flex items-baseline justify-between rounded-lg border border-border bg-surface-2 p-4">
          <span className="text-body-sm text-text-2">Example: 170 pcs</span>
          <span className="num text-subtitle font-semibold text-text">{Math.round(170 / tempMomosPerPlate)} plates</span>
        </div>
      </div>
    </ResponsiveModal>
  );
}
