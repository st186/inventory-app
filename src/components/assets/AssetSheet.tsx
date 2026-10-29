import { useState } from 'react';
import { Camera, Receipt, SearchX, Trash2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { ASSET_CATEGORIES, ASSET_CONDITIONS, type AssetCategory, type AssetCondition } from '../../utils/assetRules';
import { useT } from '../../utils/i18n';
import { Button } from '../ui/button';
import { IconButton } from '../ui/icon-button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Field } from '../ui/field';
import { NativeSelect } from '../ui/select';
import { ChoiceChips } from '../ui/chip';
import { NumberStepper } from '../ui/number-stepper';
import { MoneyInput } from '../ui/money';
import { Callout } from '../ui/callout';
import { ResponsiveModal } from '../ui/responsive-modal';
import { confirm } from '../ui/confirm';
import { assetCategoryIcon } from '../setup/setupIcons';
import {
  compressPhoto, deleteAsset, dismissAsset, inr, locationKey, markFound, reportMissing, restoreAsset, shortDate, updateAsset, uploadAssetPhoto,
  writeOffAsset, type AssetLocation, type AssetRow,
} from './assetsApi';
import { ConditionBadge } from './ConditionBadge';
import { assetCategoryKey, conditionKey } from './assetLabels';

// One register item: check-and-confirm for an item added from an expense ("review"), edit, or a
// read-only look for staff who can only view their location's list.
type Props = {
  open: boolean;
  asset: AssetRow;
  mode: 'review' | 'edit' | 'view';
  locations: AssetLocation[];
  editableLocations: string[];
  canDelete: boolean;
  // The owner and operations managers write off what is lost.
  canWriteOff?: boolean;
  onClose: () => void;
  /** After the close animation (the parent drops the sheet then). */
  onClosed?: () => void;
  onSaved: (asset: AssetRow) => void;
  onRemoved: (id: string) => void;
};

export function AssetSheet({ open, asset, mode, locations, editableLocations, canDelete, canWriteOff, onClose, onClosed, onSaved, onRemoved }: Props) {
  const { t } = useT();
  const readOnly = mode === 'view';
  const startLoc = asset.locationId ? locationKey(asset.locationKind, asset.locationId) : '';
  const [name, setName] = useState(asset.name);
  const [category, setCategory] = useState<AssetCategory>(asset.category);
  const [quantity, setQuantity] = useState(String(asset.quantity || 1));
  const [cost, setCost] = useState(asset.totalCost == null ? '' : String(asset.totalCost));
  const [purchaseDate, setPurchaseDate] = useState(asset.purchaseDate || '');
  const [loc, setLoc] = useState(startLoc);
  const [condition, setCondition] = useState<AssetCondition>(asset.condition);
  const [notes, setNotes] = useState(asset.notes || '');
  const [preview, setPreview] = useState<string | null>(asset.photoUrl);
  const [busy, setBusy] = useState<string | null>(null);
  // Report missing (owner, 30 Oct 2026): anyone at the place.
  const [reporting, setReporting] = useState(false);
  const [lost, setLost] = useState({ count: String(asset.quantity || 1), lastSeen: '', where: '', note: '', policeRef: '' });
  const canReport = !asset.dismissed && !asset.needsReview && asset.condition !== 'disposed' && !asset.missing;

  const dirty = !readOnly && (
    name !== asset.name || category !== asset.category || quantity !== String(asset.quantity || 1)
    || cost !== (asset.totalCost == null ? '' : String(asset.totalCost)) || purchaseDate !== (asset.purchaseDate || '')
    || loc !== startLoc || condition !== asset.condition || notes !== (asset.notes || '')
  );

  // Where it can be moved: the locations this person may edit, plus wherever it is now.
  const locOptions = locations.filter((l) => editableLocations.includes(locationKey(l.kind, l.id)) || locationKey(l.kind, l.id) === loc);
  const locName = (key: string) => locations.find((l) => locationKey(l.kind, l.id) === key)?.name || t('assets.noLocation');

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try { await fn(); } catch (e: any) { toast.error(e?.message || t('assets.err.generic')); } finally { setBusy(null); }
  };

  const save = (confirmIt: boolean) => run(confirmIt ? 'confirm' : 'save', async () => {
    const q = parseInt(quantity, 10);
    if (!name.trim()) throw new Error(t('assets.err.name'));
    if (!Number.isInteger(q) || q < 1) throw new Error(t('assets.err.qty'));
    if (!loc) throw new Error(t('assets.pickLocation'));
    const [locationKind, ...rest] = loc.split(':');
    const saved = await updateAsset(asset.id, {
      name: name.trim(),
      category,
      quantity: q,
      totalCost: cost.trim() === '' ? null : Number(cost),
      purchaseDate: purchaseDate || null,
      ...(condition !== asset.condition ? { condition } : {}),
      notes,
      locationKind: locationKind as AssetRow['locationKind'],
      locationId: rest.join(':'),
      confirm: confirmIt,
    });
    toast.success(confirmIt ? t('assets.confirmed') : t('assets.saved'));
    onSaved(saved);
    onClose();
  });

  const pickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await run('photo', async () => {
      const dataUrl = await compressPhoto(file);
      setPreview(dataUrl);
      const saved = await uploadAssetPhoto(asset.id, dataUrl);
      onSaved(saved);
      toast.success(t('assets.photoAdded'));
    });
  };

  const resolve = (choice: 'accept' | 'keep') => run(choice, async () => {
    const saved = await updateAsset(asset.id, { resolveExpense: choice });
    onSaved(saved);
    onClose();
  });

  const notEquipment = () => run('dismiss', async () => {
    await dismissAsset(asset.id);
    toast.success(t('assets.removed'));
    onRemoved(asset.id);
    onClose();
  });

  const bringBack = () => run('restore', async () => {
    const saved = await restoreAsset(asset.id);
    onSaved(saved);
    onClose();
  });

  const remove = async () => {
    const ok = await confirm({ title: t('assets.deleteTitle', { name: asset.name }), body: t('assets.deleteBody'), confirmLabel: t('assets.deleteConfirm'), tone: 'danger' });
    if (!ok) return;
    run('delete', async () => {
      await deleteAsset(asset.id);
      toast.success(t('assets.deleted'));
      onRemoved(asset.id);
      onClose();
    });
  };

  const sendMissing = () => run('missing', async () => {
    const saved = await reportMissing(asset.id, {
      count: asset.quantity > 1 ? Number(lost.count) : 1, lastSeen: lost.lastSeen || undefined, where: lost.where, note: lost.note, policeRef: lost.policeRef || undefined,
    });
    toast.success(t('assets.missing.sent'));
    setReporting(false);
    onSaved(saved);
    onClose();
  });
  const found = () => run('found', async () => {
    const saved = await markFound(asset.id);
    toast.success(t('assets.missing.foundDone'));
    onSaved(saved);
    onClose();
  });
  const writeOff = async () => {
    const ok = await confirm({ title: t('assets.missing.writeOffTitle', { name: asset.name }), body: t('assets.missing.writeOffBody'), confirmLabel: t('assets.missing.writeOff'), tone: 'danger' });
    if (!ok) return;
    run('writeoff', async () => {
      const saved = await writeOffAsset(asset.id, '');
      toast.success(t('assets.missing.writtenOff'));
      onSaved(saved);
      onClose();
    });
  };

  const change = asset.expenseChanged;
  const fromExpense = asset.source?.kind === 'expense';
  const title = mode === 'review' ? t('assets.sheet.review') : readOnly ? asset.name : t('assets.sheet.edit');

  const footer = readOnly ? undefined : mode === 'review' ? (
    <>
      <Button variant="secondary" size="lg" disabled={!!busy} loading={busy === 'dismiss'} onClick={notEquipment}>{t('assets.notEquipment')}</Button>
      <Button size="lg" className="flex-1" disabled={!!busy} loading={busy === 'confirm'} onClick={() => save(true)}>{t('assets.confirm')}</Button>
    </>
  ) : (
    <>
      {canDelete && <IconButton variant="danger-ghost" label={t('assets.deleteConfirm')} icon={<Trash2 />} loading={busy === 'delete'} disabled={!!busy} onClick={remove} />}
      <Button size="lg" className="flex-1" disabled={!!busy} loading={busy === 'save'} onClick={() => save(false)}>{t('common.save')}</Button>
    </>
  );

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => { if (!next) onClose(); }}
      onClosed={onClosed}
      title={title}
      description={readOnly ? locName(loc) : undefined}
      dirty={dirty && !busy}
      footer={footer}
    >
      <div className="flex flex-col gap-4">
        {fromExpense && (
          <Callout tone="info" icon={Receipt} title={asset.purchaseDate ? t('assets.fromExpense', { date: shortDate(asset.purchaseDate) }) : t('assets.fromExpenseNoDate')}>
            {asset.needsReview && !readOnly ? t('assets.reviewBody') : undefined}
          </Callout>
        )}

        {change && (
          <Callout
            tone="warning"
            title={change.kind === 'changed' ? t('assets.expenseChanged') : change.kind === 'deleted' ? t('assets.expenseDeleted') : t('assets.expenseNotEquipment')}
            action={!readOnly ? (
              <div className="flex flex-wrap gap-2">
                {change.kind === 'changed' ? (
                  <>
                    <Button variant="secondary" size="sm" disabled={!!busy} loading={busy === 'accept'} onClick={() => resolve('accept')}>{t('assets.useNew')}</Button>
                    <Button variant="secondary" size="sm" disabled={!!busy} loading={busy === 'keep'} onClick={() => resolve('keep')}>{t('assets.keepAsIs')}</Button>
                  </>
                ) : (
                  <>
                    <Button variant="secondary" size="sm" disabled={!!busy} loading={busy === 'keep'} onClick={() => resolve('keep')}>{t('assets.stillHave')}</Button>
                    <Button variant="danger-ghost" size="sm" disabled={!!busy} loading={busy === 'dismiss'} onClick={notEquipment}>{t('assets.removeFromList')}</Button>
                  </>
                )}
              </div>
            ) : undefined}
          >
            {change.kind === 'changed' && change.expense ? (
              <span className="num">
                {t('assets.expenseNow', {
                  text: [
                    change.expense.name,
                    t('assets.pcs', { n: change.expense.quantity }),
                    inr(change.expense.totalCost),
                    shortDate(change.expense.purchaseDate),
                    ...(change.expense.locationId ? [locName(locationKey(change.expense.locationKind, change.expense.locationId))] : []),
                  ].join(' · '),
                })}
              </span>
            ) : undefined}
          </Callout>
        )}

        {asset.missing && (
          <Callout
            tone="danger"
            icon={SearchX}
            title={asset.quantity > 1 && asset.missing.count < asset.quantity ? t('assets.missing.someTitle', { n: asset.missing.count, of: asset.quantity }) : t('assets.missing.title')}
            action={(
              <div className="flex flex-wrap gap-2">
                {!readOnly && <Button variant="secondary" size="sm" disabled={!!busy} loading={busy === 'found'} onClick={found}>{t('assets.missing.found')}</Button>}
                {canWriteOff && <Button variant="danger-ghost" size="sm" disabled={!!busy} loading={busy === 'writeoff'} onClick={writeOff}>{t('assets.missing.writeOff')}</Button>}
              </div>
            )}
          >
            {[t('assets.missing.by', { name: asset.missing.by, date: shortDate(asset.missing.reportedAt) }), asset.missing.lastSeen ? t('assets.missing.lastSeen', { date: shortDate(asset.missing.lastSeen) }) : '', asset.missing.where ? t('assets.missing.keptAt', { where: asset.missing.where }) : '', asset.missing.note, asset.missing.policeRef ? t('assets.missing.police', { ref: asset.missing.policeRef }) : ''].filter(Boolean).join(' · ')}
          </Callout>
        )}

        {canReport && !reporting && (
          <Button variant="secondary" leadingIcon={<SearchX />} className="self-start" onClick={() => setReporting(true)}>{t('assets.missing.report')}</Button>
        )}
        {reporting && (
          <section className="flex flex-col gap-3 rounded-lg border border-danger/40 bg-danger-soft/40 p-3" aria-label={t('assets.missing.report')}>
            <p className="text-body-sm font-semibold text-text">{t('assets.missing.report')}</p>
            {asset.quantity > 1 && (
              <Field label={t('assets.missing.howMany', { of: asset.quantity })}>
                <Input type="number" inputMode="numeric" min={1} max={asset.quantity} className="num w-24" value={lost.count} onChange={(e) => setLost({ ...lost, count: e.target.value })} />
              </Field>
            )}
            <Field label={t('assets.missing.lastSeenQ')} optional>
              <Input type="date" value={lost.lastSeen} onChange={(e) => setLost({ ...lost, lastSeen: e.target.value })} />
            </Field>
            <Field label={t('assets.missing.whereQ')}>
              <Input value={lost.where} maxLength={120} onChange={(e) => setLost({ ...lost, where: e.target.value })} placeholder={t('assets.missing.wherePh')} />
            </Field>
            <Field label={t('assets.missing.whatQ')}>
              <Textarea value={lost.note} maxLength={300} rows={2} onChange={(e) => setLost({ ...lost, note: e.target.value })} placeholder={t('assets.missing.whatPh')} />
            </Field>
            <Field label={t('assets.missing.policeQ')} optional>
              <Input value={lost.policeRef} maxLength={60} onChange={(e) => setLost({ ...lost, policeRef: e.target.value })} />
            </Field>
            <p className="text-caption text-text-3">{t('assets.missing.whoSees')}</p>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={!!busy} onClick={() => setReporting(false)}>{t('common.cancel')}</Button>
              <Button variant="danger" className="flex-1" loading={busy === 'missing'} disabled={!!busy || lost.where.trim().length < 2 || lost.note.trim().length < 5} onClick={sendMissing}>{t('assets.missing.send')}</Button>
            </div>
          </section>
        )}

        {asset.dismissed && (
          <Callout
            tone="neutral"
            title={t('assets.dismissedNote')}
            action={!readOnly ? <Button variant="secondary" size="sm" leadingIcon={<Undo2 />} disabled={!!busy} loading={busy === 'restore'} onClick={bringBack}>{t('assets.bringBack')}</Button> : undefined}
          />
        )}

        {/* Photo */}
        <div className="flex flex-col gap-1.5">
          <span className="text-body-sm font-medium text-text">{t('assets.photo')}</span>
          {readOnly ? (
            preview ? <img src={preview} alt="" className="max-h-64 w-full rounded-lg bg-surface-2 object-contain" /> : <p className="text-body-sm text-text-3">{t('assets.noPhoto')}</p>
          ) : (
            <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-md border border-border-strong bg-surface px-3 py-2 transition-colors hover:bg-surface-2 focus-within:ring-2 focus-within:ring-ring">
              {preview ? <img src={preview} alt="" className="h-12 w-16 shrink-0 rounded-sm object-cover" /> : <Camera className="size-6 shrink-0 text-text-2" aria-hidden="true" />}
              <span className="text-body-md font-semibold text-primary">{busy === 'photo' ? t('common.loading') : preview ? t('assets.retakePhoto') : t('assets.takePhoto')}</span>
              <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={!!busy} onChange={pickPhoto} />
            </label>
          )}
        </div>

        <Field label={t('assets.name')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly} maxLength={80} />
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="text-body-sm font-medium text-text">{t('assets.type')}</span>
          {readOnly ? (
            <span className="inline-flex items-center gap-2 text-body-md text-text">
              {(() => { const Icon = assetCategoryIcon(category); return <Icon className="size-5 text-text-2" aria-hidden="true" />; })()}
              {t(assetCategoryKey(category))}
            </span>
          ) : (
            <ChoiceChips
              aria-label={t('assets.type')}
              value={category}
              onValueChange={(v) => setCategory(v)}
              options={ASSET_CATEGORIES.map((c) => {
                const Icon = assetCategoryIcon(c.key);
                return { value: c.key, label: <span className="inline-flex items-center gap-1.5"><Icon className="size-4" aria-hidden="true" />{t(assetCategoryKey(c.key))}</span> };
              })}
            />
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('assets.howMany')}>
            <NumberStepper
              label={t('assets.howMany')}
              value={Math.max(1, parseInt(quantity, 10) || 1)}
              onChange={(n) => setQuantity(String(n))}
              min={1}
              editable
              disabled={readOnly}
            />
          </Field>
          <Field label={t('assets.cost')} optional={!readOnly}>
            <MoneyInput value={cost} onValueChange={(_, raw) => setCost(raw)} disabled={readOnly} />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('assets.boughtOn')}>
            <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} disabled={readOnly} />
          </Field>
          <Field label={t('assets.where')}>
            <NativeSelect value={loc} onChange={(e) => setLoc(e.target.value)} disabled={readOnly || (locOptions.length < 2 && !!loc)}>
              {!loc && <option value="">{t('assets.pickLocation')}</option>}
              {locOptions.map((l) => <option key={locationKey(l.kind, l.id)} value={locationKey(l.kind, l.id)}>{l.name}</option>)}
            </NativeSelect>
          </Field>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-body-sm font-medium text-text">{t('assets.condition')}</span>
          {readOnly || condition === 'missing' ? (
            <ConditionBadge condition={condition} />
          ) : (
            <ChoiceChips
              aria-label={t('assets.condition')}
              value={condition}
              onValueChange={(v) => setCondition(v)}
              options={ASSET_CONDITIONS.filter((c) => c.key !== 'missing').map((c) => ({ value: c.key, label: t(conditionKey(c.key)) }))}
            />
          )}
        </div>

        <Field label={t('assets.notes')} optional={!readOnly}>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={readOnly} maxLength={500} rows={2} placeholder={readOnly ? '' : t('assets.notesPlaceholder')} />
        </Field>

        {(asset.confirmedBy || asset.updatedBy) && (
          <p className="text-caption text-text-3">
            {asset.confirmedBy ? `${t('assets.confirmedBy', { name: asset.confirmedBy })} ` : ''}
            {t('assets.lastChange', { date: shortDate(asset.updatedAt), name: asset.updatedBy })}
          </p>
        )}
      </div>
    </ResponsiveModal>
  );
}
