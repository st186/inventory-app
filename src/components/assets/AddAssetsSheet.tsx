import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ASSET_CATEGORIES, guessAssetCategory, type AssetCategory } from '../../utils/assetRules';
import { useT } from '../../utils/i18n';
import { Button } from '../ui/button';
import { IconButton } from '../ui/icon-button';
import { Input } from '../ui/input';
import { Field } from '../ui/field';
import { NativeSelect } from '../ui/select';
import { MoneyInput } from '../ui/money';
import { ResponsiveModal } from '../ui/responsive-modal';
import { createAssets, locationKey, type AssetLocation, type AssetRow } from './assetsApi';
import { assetCategoryKey } from './assetLabels';

// Listing what a location already has: one quick row per item (name, how many, type, cost if
// known). Photos and condition can be added afterwards from the item itself.
type Row = { key: number; name: string; quantity: string; category: AssetCategory; cost: string; picked: boolean };

// The usual kit, so a whole kitchen can be listed in a few taps.
const QUICK_PICKS = [
  'Momo steamer', 'Deep freezer', 'Fridge', 'Gas stove', 'Induction', 'Fryer', 'Kadai', 'Tawa', 'Mixer grinder',
  'Weighing scale', 'Steel container', 'Storage rack', 'Dustbin', 'Bucket', 'Table', 'Chair', 'Fan', 'Tube light',
];

let nextKey = 1;
const emptyRow = (name = ''): Row => ({ key: nextKey++, name, quantity: '1', category: name ? guessAssetCategory(name) : 'other', cost: '', picked: false });

type Props = {
  open: boolean;
  locations: AssetLocation[];
  editableLocations: string[];
  defaultLocation: string;
  onClose: () => void;
  onAdded: (rows: AssetRow[]) => void;
};

export function AddAssetsSheet({ open, locations, editableLocations, defaultLocation, onClose, onAdded }: Props) {
  const { t } = useT();
  const options = locations.filter((l) => editableLocations.includes(locationKey(l.kind, l.id)));
  const startLoc = () => (options.some((l) => locationKey(l.kind, l.id) === defaultLocation) ? defaultLocation : (options[0] ? locationKey(options[0].kind, options[0].id) : ''));
  const [loc, setLoc] = useState(startLoc);
  const [rows, setRows] = useState<Row[]>(() => [emptyRow()]);
  const [saving, setSaving] = useState(false);

  const filledCount = rows.filter((r) => r.name.trim()).length;

  const reset = () => {
    setLoc(startLoc());
    setRows([emptyRow()]);
  };

  const patch = (key: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => {
    if (r.key !== key) return r;
    const next = { ...r, ...p };
    // Guess the type from the name until someone picks one themselves.
    if (p.name !== undefined && !next.picked) next.category = guessAssetCategory(p.name);
    return next;
  }));

  const quickAdd = (name: string) => setRows((rs) => {
    const blank = rs.find((r) => !r.name.trim());
    return blank ? rs.map((r) => (r.key === blank.key ? { ...r, name, category: r.picked ? r.category : guessAssetCategory(name) } : r)) : [...rs, emptyRow(name)];
  });

  const save = async () => {
    const filled = rows.filter((r) => r.name.trim());
    if (!loc) return toast.error(t('assets.pickLocation'));
    if (!filled.length) return toast.error(t('assets.add.needOne'));
    const bad = filled.find((r) => !(parseInt(r.quantity, 10) >= 1));
    if (bad) return toast.error(t('assets.add.badQty', { name: bad.name }));
    const [locationKind, ...rest] = loc.split(':');
    setSaving(true);
    try {
      const added = await createAssets(filled.map((r) => ({
        name: r.name.trim(),
        quantity: parseInt(r.quantity, 10),
        category: r.category,
        totalCost: r.cost.trim() === '' ? null : Number(r.cost),
        locationKind: locationKind as AssetRow['locationKind'],
        locationId: rest.join(':'),
      })));
      toast.success(t('assets.add.added', { n: added.length }));
      onAdded(added);
      onClose();
    } catch (e: any) {
      toast.error(e?.message || t('assets.add.failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => { if (!next) onClose(); }}
      onClosed={reset}
      title={t('assets.add.title')}
      description={t('assets.add.subtitle')}
      dirty={filledCount > 0 && !saving}
      footer={
        <Button size="lg" className="flex-1" loading={saving} onClick={save}>
          {filledCount === 1 ? t('assets.add.saveOne') : t('assets.add.save', { n: filledCount || '' }).replace(/\s{2,}/g, ' ')}
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label={t('assets.where')}>
          <NativeSelect value={loc} onChange={(e) => setLoc(e.target.value)} disabled={options.length < 2}>
            {!loc && <option value="">{t('assets.pickLocation')}</option>}
            {options.map((l) => <option key={locationKey(l.kind, l.id)} value={locationKey(l.kind, l.id)}>{l.name}</option>)}
          </NativeSelect>
        </Field>

        <div className="flex flex-col gap-2">
          <span className="text-body-sm font-medium text-text">{t('assets.add.quick')}</span>
          <div className="flex flex-wrap gap-2">
            {QUICK_PICKS.map((n) => (
              <Button key={n} variant="secondary" size="sm" leadingIcon={<Plus />} onClick={() => quickAdd(n)}>{n}</Button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {rows.map((r, i) => (
            <div key={r.key} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3">
              <div className="flex items-end gap-2">
                <Field label={t('assets.add.itemN', { n: i + 1 })} className="flex-1">
                  <Input value={r.name} onChange={(e) => patch(r.key, { name: e.target.value })} placeholder={t('assets.add.placeholder')} maxLength={80} />
                </Field>
                {rows.length > 1 && (
                  <IconButton variant="danger-ghost" label={t('assets.add.removeRow')} icon={<Trash2 />} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="mb-0.5" />
                )}
              </div>
              <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3">
                <Field label={t('assets.howMany')}>
                  <Input type="number" inputMode="numeric" min={1} value={r.quantity} onChange={(e) => patch(r.key, { quantity: e.target.value })} className="num text-center" />
                </Field>
                <Field label={t('assets.add.costShort')} optional>
                  <MoneyInput value={r.cost} onValueChange={(_, raw) => patch(r.key, { cost: raw })} />
                </Field>
              </div>
              <Field label={t('assets.type')}>
                <NativeSelect value={r.category} onChange={(e) => patch(r.key, { category: e.target.value as AssetCategory, picked: true })}>
                  {ASSET_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{t(assetCategoryKey(c.key))}</option>)}
                </NativeSelect>
              </Field>
            </div>
          ))}
          <Button variant="secondary" leadingIcon={<Plus />} onClick={() => setRows((rs) => [...rs, emptyRow()])}>{t('assets.add.another')}</Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
