// The equipment check (owner, 30 Oct 2026: every 3 months, with the month-end momo count): the
// place's list, each item seen / not found / broken, a count for sets, and a photo of anything over
// Rs 2,000 apiece (the item's photo, taken now). Anything not found becomes missing and the owner,
// the operations managers and the incharge are told (server assets.ts).
import { useEffect, useState } from 'react';
import { Camera, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useT } from '../../utils/i18n';
import { Button } from '../ui/button';
import { Callout } from '../ui/callout';
import { Input } from '../ui/input';
import { ResponsiveModal } from '../ui/responsive-modal';
import { cn } from '../ui/utils';
import { compressPhoto, getEquipmentCheck, inr, submitEquipmentCheck, uploadAssetPhoto, type CheckStatus, type EquipmentCheck } from './assetsApi';
import { ConditionBadge } from './ConditionBadge';

type Props = { open: boolean; locationKind: string; locationId: string; placeName: string; onClose: () => void; onDone: () => void };

export function EquipmentCheckSheet({ open, locationKind, locationId, placeName, onClose, onDone }: Props) {
  const { t } = useT();
  const [data, setData] = useState<EquipmentCheck | null>(null);
  const [answers, setAnswers] = useState<Record<string, { status?: CheckStatus; counted?: string; photo?: boolean }>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setData(null);
    setAnswers({});
    getEquipmentCheck(locationKind, locationId).then(setData).catch((e) => toast.error(e?.message || t('assets.err.generic')));
  }, [open, locationKind, locationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = data?.items || [];
  const set = (id: string, patch: { status?: CheckStatus; counted?: string; photo?: boolean }) => setAnswers((a) => ({ ...a, [id]: { ...a[id], ...patch } }));
  const left = items.filter((a) => !answers[a.id]?.status || (answers[a.id].status === 'seen' && a.needsPhoto && !answers[a.id].photo)).length;

  const photo = async (id: string, file?: File) => {
    if (!file) return;
    setBusy(id);
    try {
      await uploadAssetPhoto(id, await compressPhoto(file));
      set(id, { photo: true });
    } catch (e: any) {
      toast.error(e?.message || t('assets.err.generic'));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy('save');
    try {
      await submitEquipmentCheck({
        locationKind, locationId,
        results: Object.fromEntries(items.map((a) => [a.id, { status: answers[a.id]?.status, ...(a.quantity > 1 ? { counted: Number(answers[a.id]?.counted ?? a.quantity) } : {}) }])),
      });
      toast.success(t('assets.check.saved'));
      onDone();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || t('assets.err.generic'));
    } finally {
      setBusy(null);
    }
  };

  const STATUSES: { s: CheckStatus; label: string }[] = [
    { s: 'seen', label: t('assets.check.seen') }, { s: 'not_found', label: t('assets.check.notFound') }, { s: 'broken', label: t('assets.check.broken') },
  ];

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => { if (!next) onClose(); }}
      title={t('assets.check.title')}
      description={placeName}
      footer={data && items.length > 0 ? (
        <Button size="lg" className="flex-1" loading={busy === 'save'} disabled={!!busy || left > 0} onClick={save}>
          {left > 0 ? t('assets.check.left', { n: left }) : t('assets.check.save')}
        </Button>
      ) : undefined}
    >
      {!data ? <p className="text-body-sm text-text-3">{t('common.loading')}</p> : (
        <div className="flex flex-col gap-3">
          <Callout tone="neutral" title={t('assets.check.how')} />
          {items.length === 0 && <p className="text-body-sm text-text-2">{t('assets.check.nothing')}</p>}
          <div className="overflow-hidden rounded-lg border border-border bg-surface [&>*+*]:border-t [&>*+*]:border-border">
            {items.map((a) => {
              const ans = answers[a.id] || {};
              return (
                <div key={a.id} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col">
                      <span className="text-body-md font-medium text-text">{a.name}</span>
                      <span className="num text-caption text-text-3">{[t('assets.pcs', { n: a.quantity }), inr(a.totalCost)].join(' · ')}</span>
                    </div>
                    {a.condition !== 'good' && <ConditionBadge condition={a.condition} />}
                  </div>
                  <div className="flex flex-wrap gap-2" role="group" aria-label={a.name}>
                    {STATUSES.map(({ s, label }) => (
                      <button key={s} type="button" aria-pressed={ans.status === s} onClick={() => set(a.id, { status: s })}
                        className={cn('hit-44 inline-flex min-h-9 items-center rounded-full border px-3 text-label font-medium',
                          ans.status === s ? (s === 'seen' ? 'border-success bg-success-soft text-success' : 'border-danger bg-danger-soft text-danger') : 'border-border-strong bg-surface text-text')}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {ans.status === 'seen' && a.quantity > 1 && (
                    <label className="flex items-center gap-2 text-body-sm text-text-2">
                      {t('assets.check.counted')}
                      <Input type="number" inputMode="numeric" min={0} max={a.quantity} className="num w-20" value={ans.counted ?? String(a.quantity)}
                        onChange={(e) => set(a.id, { counted: e.target.value })} aria-label={`${a.name}: ${t('assets.check.counted')}`} />
                      / {a.quantity}
                    </label>
                  )}
                  {ans.status === 'seen' && a.needsPhoto && (
                    <label className={cn('flex min-h-11 cursor-pointer items-center gap-2 self-start rounded-md border px-3 text-body-sm font-semibold',
                      ans.photo ? 'border-success text-success' : 'border-border-strong text-primary')}>
                      {ans.photo ? <Check className="size-4" aria-hidden="true" /> : <Camera className="size-4" aria-hidden="true" />}
                      {busy === a.id ? t('common.loading') : ans.photo ? t('assets.check.photoDone') : t('assets.check.photo')}
                      <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={!!busy} onChange={(e) => { photo(a.id, e.target.files?.[0]); e.target.value = ''; }} />
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </ResponsiveModal>
  );
}
