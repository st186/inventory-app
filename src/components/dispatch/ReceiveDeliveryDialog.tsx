import { useMemo, useState } from 'react';
import { Camera, Image as ImageIcon, PackageCheck, X } from 'lucide-react';
import { toast } from '../ui/sonner';
import { Button } from '../ui/button';
import { Callout } from '../ui/callout';
import { ChoiceChips } from '../ui/chip';
import { Checkbox } from '../ui/checkbox';
import { Field } from '../ui/field';
import { IconButton } from '../ui/icon-button';
import { Input } from '../ui/input';
import { NativeSelect } from '../ui/select';
import { ResponsiveModal } from '../ui/responsive-modal';
import { SegmentedControl } from '../ui/segmented-control';
import { Textarea } from '../ui/textarea';
import { t as tSaved, useT } from '../../utils/i18n';
import * as api from '../../utils/api';
import type { ProductionRequest } from '../../utils/api';
import { RECEIPT_DAMAGE_REASONS, ReceiptDamageReason, bagSize } from '../../utils/batches';
import { QuantityStepper, bagsText, momoName, reasonLabel, whenLabel } from '../stock/stockShared';

type Labels = { camelKey: string; label: string }[];
const shortLabel = (label: string) => label.replace(/ Momos?$/, '');

// Phone photos are 3-5 MB; a 1024px JPEG at 60% is ~100 KB and still shows a crushed bag.
async function compressImage(file: File, maxDim = 1024, quality = 0.6): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

interface LineDraft {
  received: number;
  damaged: number;
  damageReason: ReceiptDamageReason;
  damageBatch: string;
}

type Props = {
  request: ProductionRequest;
  products: Labels;
  accessToken: string;
  onClose: () => void;
  onReceived: (request: ProductionRequest) => void;
};

// The store's count of a delivery (SOP 1.5, bottom half, and picture guide "Store receiving"):
// count bags against the slip, check the momos are hard, record anything crushed, stuck or
// soft with its batch code and a photo. Short and damaged pieces are logged as waste (Q).
export function ReceiveDeliveryDialog({ request, products, accessToken, onClose, onReceived }: Props) {
  const { t, lang } = useT();
  const [open, setOpen] = useState(true);
  const shippedProducts = useMemo(
    () => products.filter(({ camelKey }) => (request.shippedQuantities?.[camelKey] || 0) > 0),
    [products, request.shippedQuantities]
  );
  const [lines, setLines] = useState<Record<string, LineDraft>>(() => Object.fromEntries(
    shippedProducts.map(({ camelKey }) => [camelKey, { received: request.shippedQuantities?.[camelKey] || 0, damaged: 0, damageReason: 'crushed' as ReceiptDamageReason, damageBatch: '' }])
  ));
  const sentSauces = useMemo(
    () => Object.keys(request.sauces || {}).filter((s) => request.sauces?.[s] && (request.shippedSauces ? request.shippedSauces[s] : true)),
    [request.sauces, request.shippedSauces]
  );
  const [saucesMissing, setSaucesMissing] = useState<string[]>([]);
  const [boxesReceived, setBoxesReceived] = useState(request.dispatch?.boxes ? String(request.dispatch.boxes) : '');
  const [hardFrozen, setHardFrozen] = useState<boolean | null>(null);
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const setLine = (key: string, patch: Partial<LineDraft>) => setLines((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  const anyDamage = Object.values(lines).some((l) => l.damaged > 0);
  const needsPhoto = anyDamage || hardFrozen === false;

  const addPhoto = async (file?: File) => {
    if (!file) return;
    try {
      const dataUrl = await compressImage(file);
      setPhotos((prev) => [...prev, dataUrl].slice(0, 4));
    } catch {
      toast.error(tSaved('stock.recv.photoFailed'));
    }
  };

  const save = async () => {
    if (hardFrozen === null) {
      toast.error(tSaved('stock.recv.sayFrozen'));
      return;
    }
    if (needsPhoto && photos.length === 0) {
      toast.error(tSaved('stock.recv.photoNeeded'));
      return;
    }
    setSaving(true);
    try {
      const photoIds: string[] = [];
      for (const dataUrl of photos) {
        photoIds.push(await api.uploadReceiptPhoto(accessToken, request.id, dataUrl));
      }
      const updated = await api.receiveProductionRequest(accessToken, request.id, {
        lines: Object.fromEntries(Object.entries(lines).map(([key, l]) => [key, {
          shipped: request.shippedQuantities?.[key] || 0,
          received: l.received,
          damaged: l.damaged,
          ...(l.damaged > 0 ? { damageReason: l.damageReason, damageBatch: l.damageBatch || undefined } : {}),
        }])),
        saucesMissing,
        boxesReceived: boxesReceived === '' ? undefined : parseInt(boxesReceived, 10) || 0,
        hardFrozen,
        notes: notes.trim() || undefined,
        photoIds,
      });
      toast.success(tSaved('stock.recv.saved'));
      onReceived(updated);
    } catch (error: any) {
      toast.error(error?.message || tSaved('stock.recv.saveFailed'));
    } finally {
      setSaving(false);
    }
  };


  const dirty = Object.values(lines).some((l) => l.damaged > 0) || hardFrozen !== null || photos.length > 0 || notes.trim() !== '' || saucesMissing.length > 0;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(o) => { if (!o) setOpen(false); }}
      onClosed={onClose}
      dirty={dirty && !saving}
      title={t('stock.recv.sheetTitle')}
      description={t('stock.recv.caption')}
      size="detail"
      footer={
        <Button size="lg" className="flex-1" leadingIcon={<PackageCheck />} loading={saving} onClick={save}>
          {t('stock.recv.save')}
        </Button>
      }
    >
      <div className="flex flex-col gap-5" lang={lang}>
        <div className="overflow-hidden rounded-lg border border-border bg-surface [&>*+*]:border-t [&>*+*]:border-border">
          {shippedProducts.map(({ camelKey, label }) => {
            const shipped = request.shippedQuantities?.[camelKey] || 0;
            const l = lines[camelKey];
            const size = bagSize(camelKey);
            const diff = l.received - shipped;
            const batches = request.dispatch?.batches?.[camelKey] || [];
            const name = momoName(lang, camelKey, label);
            return (
              <div key={camelKey} className="flex flex-col gap-3 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-body-md font-medium text-text">{name}</span>
                    <span className="num text-label text-text-3">{t('stock.recv.sent', { bags: bagsText(lang, shipped, camelKey), n: shipped })}</span>
                    {diff !== 0 && <span className={`num text-label font-semibold ${diff < 0 ? 'text-danger' : 'text-warning'}`}>{diff < 0 ? t('stock.recv.short', { n: -diff }) : t('stock.recv.extra', { n: diff })}</span>}
                  </span>
                  <QuantityStepper label={name} value={l.received} step={size} bump={(v, d) => (d < 0 ? Math.ceil(v / size) * size - size : Math.floor(v / size) * size + size)} onChange={(n) => setLine(camelKey, { received: Math.max(0, n) })} />
                </div>
                <Field label={t('stock.recv.damaged')}>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={l.damaged ? String(l.damaged) : ''}
                    placeholder="0"
                    onChange={(e) => setLine(camelKey, { damaged: Math.min(l.received, Math.max(0, parseInt(e.target.value.replace(/[^\d]/g, ''), 10) || 0)) })}
                    className="num"
                  />
                </Field>
                {l.damaged > 0 && (
                  <>
                    <ChoiceChips
                      aria-label={t('stock.recv.whatWrong')}
                      value={l.damageReason}
                      onValueChange={(v) => setLine(camelKey, { damageReason: v })}
                      options={RECEIPT_DAMAGE_REASONS.map((r) => ({ value: r.id, label: reasonLabel(lang, 'dmg', r.id, r.label) }))}
                    />
                    <Field label={t('stock.recv.batch')}>
                      <NativeSelect value={l.damageBatch} onChange={(e) => setLine(camelKey, { damageBatch: e.target.value })}>
                        <option value="">{t('stock.recv.batchUnknown')}</option>
                        {batches.map((b) => <option key={b.code} value={b.code}>{b.code}</option>)}
                      </NativeSelect>
                    </Field>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {sentSauces.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="overline-label mx-1">{t('stock.recv.sauces')}</h3>
            <div className="overflow-hidden rounded-lg border border-border bg-surface [&>*+*]:border-t [&>*+*]:border-border">
              {sentSauces.map((s) => {
                const missing = saucesMissing.includes(s);
                const id = `rcv-sauce-${s.replace(/\W+/g, '-')}`;
                return (
                  <label key={s} htmlFor={id} className="flex min-h-12 cursor-pointer items-center gap-3 px-4">
                    <Checkbox id={id} checked={!missing} onCheckedChange={(v) => setSaucesMissing((prev) => (v === true ? prev.filter((x) => x !== s) : [...prev, s]))} />
                    <span className={`text-body-md ${missing ? 'text-danger' : 'text-text'}`}>{s}</span>
                  </label>
                );
              })}
            </div>
          </section>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('stock.recv.boxes')} hint={request.dispatch?.boxes ? t('stock.recv.boxesSent', { n: request.dispatch.boxes }) : undefined}>
            <Input type="text" inputMode="numeric" value={boxesReceived} onChange={(e) => setBoxesReceived(e.target.value.replace(/[^\d]/g, ''))} className="num" />
          </Field>
          <Field label={t('stock.recv.hardFrozen')} required>
            <SegmentedControl
              aria-label={t('stock.recv.hardFrozen')}
              value={hardFrozen === null ? '' : hardFrozen ? 'hard' : 'soft'}
              onValueChange={(v) => setHardFrozen(v === 'hard')}
              options={[{ value: 'hard', label: t('stock.recv.yesHard') }, { value: 'soft', label: t('stock.recv.noSoft') }]}
            />
          </Field>
        </div>
        {hardFrozen === false && <Callout tone="danger" title={t('stock.recv.noSoft')}>{t('stock.recv.softWarning')}</Callout>}

        <Field label={t('stock.recv.photos')} required={needsPhoto} helper={t('stock.recv.photosHint')}>
          <div className="flex flex-wrap gap-2">
            {photos.map((p, i) => (
              <div key={i} className="relative">
                <img src={p} alt={`${t('stock.recv.photos')} ${i + 1}`} className="size-20 rounded-md border border-border object-cover" />
                <IconButton label={t('stock.recv.removePhoto')} icon={<X />} size="sm" variant="secondary" className="absolute -top-2 -right-2" onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))} />
              </div>
            ))}
            {photos.length < 4 && (
              <label className="flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-border-strong text-caption text-text-2 [&_svg]:size-5">
                <Camera aria-hidden="true" /> {t('stock.recv.addPhoto')}
                <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { addPhoto(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
            )}
          </div>
        </Field>

        <Field label={t('stock.req.notes')} optional>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('stock.recv.notesPlaceholder')} />
        </Field>
      </div>
    </ResponsiveModal>
  );
}

type SummaryProps = {
  request: ProductionRequest;
  products: Labels;
  accessToken: string;
};

// Sent vs counted for a received delivery, with the store's photos on demand.
export function ReceiptSummary({ request, products, accessToken }: SummaryProps) {
  const { t, lang } = useT();
  const r = request.receipt;
  const [photos, setPhotos] = useState<{ id: string; dataUrl: string }[] | null>(null);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  if (!r) return null;

  const rows = products.filter(({ camelKey }) => r.lines[camelKey]);
  const problems = rows.some(({ camelKey }) => r.lines[camelKey].received !== r.lines[camelKey].shipped || r.lines[camelKey].damaged > 0)
    || (r.saucesMissing?.length || 0) > 0 || !r.hardFrozen;

  const loadPhotos = async () => {
    setLoadingPhotos(true);
    try {
      setPhotos(await api.getReceiptPhotos(accessToken, request.id));
    } catch {
      toast.error(tSaved('stock.recv.photosFailed'));
    } finally {
      setLoadingPhotos(false);
    }
  };

  return (
    <section className="flex flex-col">
      <div className="mx-1 mb-2 flex flex-col">
        <h3 className="overline-label">{problems ? t('stock.recv.differences') : t('stock.recv.allCorrect')}</h3>
        <span className="text-label text-text-3">{t('stock.recv.countedBy', { name: r.receivedByName, when: whenLabel(lang, r.receivedAt) })}</span>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-surface [&>*+*]:border-t [&>*+*]:border-border">
        {rows.map(({ camelKey, label }) => {
          const l = r.lines[camelKey];
          const short = l.received !== l.shipped;
          return (
            <div key={camelKey} className="flex items-center gap-3 px-4 py-2.5">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-body-sm font-medium text-text">{momoName(lang, camelKey, label)}</span>
                {l.damaged > 0 && (
                  <span className="text-caption text-danger">
                    {t('stock.recv.damagedN', { n: l.damaged })} · {reasonLabel(lang, 'dmg', l.damageReason || '', RECEIPT_DAMAGE_REASONS.find((x) => x.id === l.damageReason)?.label || '')}{l.damageBatch ? ` · ${l.damageBatch}` : ''}
                  </span>
                )}
              </span>
              <span className={`num text-body-sm font-semibold ${short ? 'text-danger' : 'text-text'}`}>{t('stock.recv.sentCounted', { sent: l.shipped, counted: l.received })}</span>
            </div>
          );
        })}
      </div>
      <div className="mx-1 mt-2 flex flex-col gap-0.5 text-label text-text-2">
        {(r.saucesMissing?.length || 0) > 0 && <span className="text-danger">{t('stock.recv.saucesMissing', { list: r.saucesMissing!.join(', ') })}</span>}
        <span>
          {r.hardFrozen ? t('stock.recv.arrivedHard') : <span className="font-semibold text-danger">{t('stock.recv.arrivedSoft')}</span>}
          {r.boxesReceived != null ? ` · ${t('stock.recv.boxesReceivedN', { n: r.boxesReceived })}` : ''}
        </span>
        {r.notes && <span>{r.notes}</span>}
      </div>
      {(r.photoIds?.length || 0) > 0 && (
        photos ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {photos.map((p) => (
              <a key={p.id} href={p.dataUrl} target="_blank" rel="noopener noreferrer" className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <img src={p.dataUrl} alt={t('stock.recv.photos')} className="size-20 rounded-md border border-border object-cover" />
              </a>
            ))}
          </div>
        ) : (
          <Button variant="link" size="sm" className="mx-1 mt-2 self-start" leadingIcon={<ImageIcon />} loading={loadingPhotos} onClick={loadPhotos}>
            {t('stock.recv.photosN', { n: r.photoIds!.length })}
          </Button>
        )
      )}
    </section>
  );
}
