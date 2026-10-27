import { useState } from 'react';
import { toast } from './ui/sonner';
import { Button } from './ui/button';
import { Callout } from './ui/callout';
import { Field } from './ui/field';
import { Input } from './ui/input';
import { ResponsiveModal } from './ui/responsive-modal';
import * as api from '../utils/api';

type ThresholdSettings = {
  [key: string]: {
    high: number;
    medium: number;
    low: number;
  };
};

type Props = {
  storeId: string;
  accessToken: string;
  thresholds: ThresholdSettings;
  onClose: () => void;
  onSave: (thresholds: ThresholdSettings) => void;
};

const MOMO_TYPES = [
  { key: 'chicken', label: 'Chicken' },
  { key: 'chickenCheese', label: 'Chicken cheese' },
  { key: 'veg', label: 'Veg' },
  { key: 'cheeseCorn', label: 'Cheese corn' },
  { key: 'paneer', label: 'Paneer' },
  { key: 'vegKurkure', label: 'Veg kurkure' },
  { key: 'chickenKurkure', label: 'Chicken kurkure' },
];

// The store's stock alert levels per momo type (cluster head; a Setup item in the new
// navigation). On hand shows "Getting low" at or under Medium, "Low" at or under Low and "Out"
// at zero. The levels are compared with the stock in pieces.
export function StockThresholdSettings({ storeId, accessToken, thresholds, onClose, onSave }: Props) {
  const [open, setOpen] = useState(true);
  const [localThresholds, setLocalThresholds] = useState(thresholds);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const handleChange = (momoKey: string, level: 'high' | 'medium' | 'low', value: string) => {
    const numValue = parseInt(value) || 0;
    setDirty(true);
    setLocalThresholds({
      ...localThresholds,
      [momoKey]: {
        ...localThresholds[momoKey],
        [level]: numValue,
      },
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await api.saveStockThresholds(accessToken, storeId, localThresholds);
      onSave(localThresholds);
      toast.success('Stock alert levels saved');
      onClose();
    } catch (error) {
      console.error('Error saving thresholds:', error);
      toast.error("Couldn't save the alert levels");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(o) => { if (!o) setOpen(false); }}
      onClosed={onClose}
      dirty={dirty && !saving}
      title="Stock alert levels"
      description="When a momo shows Getting low, Low or Out"
      size="detail"
      footer={<Button size="lg" className="flex-1" loading={saving} onClick={handleSave}>Save alert levels</Button>}
    >
      <div className="flex flex-col gap-5">
        <Callout tone="info" title="How it works">
          Above High: fine. At or under Medium: getting low. At or under Low: low. Zero: out. Levels are in pieces.
        </Callout>
        {MOMO_TYPES.map(({ key, label }) => {
          const threshold = localThresholds[key] || { high: 600, medium: 300, low: 150 };
          return (
            <section key={key} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
              <h3 className="text-body-md font-semibold text-text">{label}</h3>
              <div className="grid grid-cols-3 gap-3">
                <Field label="High">
                  <Input type="text" inputMode="numeric" className="num" value={String(threshold.high)} onChange={(e) => handleChange(key, 'high', e.target.value)} />
                </Field>
                <Field label="Medium">
                  <Input type="text" inputMode="numeric" className="num" value={String(threshold.medium)} onChange={(e) => handleChange(key, 'medium', e.target.value)} />
                </Field>
                <Field label="Low">
                  <Input type="text" inputMode="numeric" className="num" value={String(threshold.low)} onChange={(e) => handleChange(key, 'low', e.target.value)} />
                </Field>
              </div>
            </section>
          );
        })}
      </div>
    </ResponsiveModal>
  );
}
