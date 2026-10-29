// Running low on Home (owner, 28 Oct 2026; server supplies.ts). Anyone at a store or the production
// house tells the team a supply is running low or finished - washing powder, KOT rolls - and how
// much is needed if they know. What is already flagged there shows too, so nobody flags it twice,
// and what happened to theirs. The incharge, operations and the owner mark a flag sorted or not
// needed; flags on a shopping list close when the line is bought.
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, PackageMinus, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Field } from '../ui/field';
import { Input } from '../ui/input';
import { ResponsiveModal } from '../ui/responsive-modal';
import { SegmentedControl } from '../ui/segmented-control';
import { NativeSelect } from '../ui/select';
import { StatusChip, type StatusTone } from '../ui/status-chip';
import { Textarea } from '../ui/textarea';
import { useT } from '../../utils/i18n';
import { ItemPicker, UNITS, useSupplyCandidates, type ItemPick } from './supplyItems';
import * as api from './suppliesApi';

const STATUS_TONE: Record<api.SupplyAlert['status'], StatusTone> = { open: 'warning', listed: 'info', done: 'success', dropped: 'neutral' };
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const dayTime = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

export function RunningLowCard() {
  const { t, lang } = useT();
  const [data, setData] = useState<api.AlertList | null>(null);
  const [raising, setRaising] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => { api.listAlerts().then(setData).catch(() => undefined); }, []);
  useEffect(() => { load(); }, [load]);
  if (!data) return null;

  const live = data.alerts.filter((a) => a.status === 'open' || a.status === 'listed');
  const closedMine = data.alerts.filter((a) => a.mine && (a.status === 'done' || a.status === 'dropped')).slice(0, 2);
  // The owner and ops see the card only when something is flagged; everyone at a place always can flag.
  if (data.canManage && !live.length) return null;
  if (!data.canManage && !data.myPlace) return null;

  const close = async (a: api.SupplyAlert, outcome: 'done' | 'dropped') => {
    setBusy(`${a.id}:${outcome}`);
    try { await api.closeAlert(a.id, outcome); load(); } catch (e) { toast.error((e as Error).message || t('supply.failed')); } finally { setBusy(null); }
  };
  const statusText = (a: api.SupplyAlert) => t(`supply.status.${a.status}`);

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4" data-tour="low">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <PackageMinus className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
          <div className="flex min-w-0 flex-col">
            <span className="text-body-md font-semibold text-text">{data.canManage ? `${t('supply.listTitle')} · ${live.length}` : t('supply.title')}</span>
            {!data.canManage && <span className="text-body-sm text-text-2">{t('supply.body')}</span>}
          </div>
        </div>
        {!data.canManage && <Button size="sm" leadingIcon={<Plus />} onClick={() => setRaising(true)}>{t('supply.flag')}</Button>}
      </div>

      {live.length > 0 && (
        <ul className="flex flex-col divide-y divide-border">
          {live.map((a) => (
            <li key={a.id} className="flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col">
                  <span className="text-body-sm font-medium text-text">
                    {lang === 'bn' && a.itemBn ? `${a.itemBn} · ${a.item}` : a.item}
                    {a.qty ? <span className="num font-normal text-text-2"> · {t('supply.need', { qty: a.qty, unit: a.unit || '' })}</span> : null}
                  </span>
                  <span className="text-label text-text-3">
                    {[data.canManage ? a.placeName : null, `${a.raisedBy.map((r) => r.name).join(', ')} · ${timeOf(a.raisedBy[0]?.at || a.createdAt)}`].filter(Boolean).join(' · ')}
                  </span>
                  {a.note && <span className="text-label text-text-2">&ldquo;{a.note}&rdquo;</span>}
                </div>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <StatusChip tone={a.level === 'out' ? 'danger' : 'warning'} size="sm">{t(a.level === 'out' ? 'supply.out' : 'supply.low')}</StatusChip>
                  {a.status === 'listed' && <StatusChip tone="info" size="sm">{statusText(a)}</StatusChip>}
                </span>
              </div>
              {a.canClose && (
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" leadingIcon={<CheckCircle2 />} loading={busy === `${a.id}:done`} onClick={() => close(a, 'done')}>{t('supply.status.done')}</Button>
                  <Button size="sm" variant="ghost" loading={busy === `${a.id}:dropped`} onClick={() => close(a, 'dropped')}>{t('supply.status.dropped')}</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {closedMine.map((a) => (
        <div key={a.id} className="flex items-center justify-between gap-2 rounded-md bg-surface-2 px-3 py-2">
          <span className="min-w-0 text-label text-text-2">
            <span className="font-medium text-text">{lang === 'bn' && a.itemBn ? a.itemBn : a.item}</span>
            {a.closedByName ? ` · ${a.closedByName}` : ''}{a.closedNote ? `: ${a.closedNote}` : ''}{a.closedAt ? ` · ${dayTime(a.closedAt)}` : ''}
          </span>
          <StatusChip tone={STATUS_TONE[a.status]} size="sm">{statusText(a)}</StatusChip>
        </div>
      ))}
      {raising && <RaiseSheet list={data} onClose={() => setRaising(false)} onSaved={() => { setRaising(false); load(); }} />}
    </section>
  );
}

function RaiseSheet({ list, onClose, onSaved }: { list: api.AlertList; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const candidates = useSupplyCandidates();
  const [open, setOpen] = useState(true);
  const [pick, setPick] = useState<ItemPick>({ item: '' });
  const [level, setLevel] = useState<'low' | 'out'>('low');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [note, setNote] = useState('');
  const [place, setPlace] = useState(list.places?.[0] ? `${list.places[0].kind}:${list.places[0].id}` : '');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!pick.item.trim()) { toast.error(t('supply.pickItem')); return; }
    setSaving(true);
    try {
      const [placeKind, placeId] = place.split(':');
      const r = await api.raiseAlert({
        item: pick.item.trim(), itemBn: pick.itemBn, entryType: pick.entryType, category: pick.category, level,
        qty: Number(qty) > 0 ? Number(qty) : null, unit: Number(qty) > 0 ? unit : null, note: note.trim() || undefined,
        ...(list.places ? { placeKind: placeKind as api.PlaceKind, placeId } : {}),
      });
      toast.success(r.merged ? t('supply.merged') : t('supply.sent'));
      setOpen(false);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message || t('supply.failed'));
    } finally {
      setSaving(false);
    }
  };
  return (
    <ResponsiveModal open={open} onOpenChange={(o) => !o && setOpen(false)} onClosed={onClose} title={t('supply.sheetTitle')} dirty={!!pick.item}
      description={list.myPlace ? t('supply.at', { place: list.myPlace.name }) : undefined}
      footer={<Button size="lg" className="flex-1" loading={saving} onClick={save}>{t('supply.send')}</Button>}>
      <div className="flex flex-col gap-4">
        {list.places && (
          <Field label={t('supply.where')}>
            <NativeSelect value={place} onChange={(e) => setPlace(e.target.value)}>
              {list.places.map((p) => <option key={`${p.kind}:${p.id}`} value={`${p.kind}:${p.id}`}>{p.name}</option>)}
            </NativeSelect>
          </Field>
        )}
        <Field label={t('supply.item')} required>
          <ItemPicker candidates={candidates} onPick={setPick} placeholder={t('supply.itemPh')} />
        </Field>
        <Field label={t('supply.level')}>
          <SegmentedControl aria-label={t('supply.level')} value={level} onValueChange={(v) => setLevel(v as 'low' | 'out')}
            options={[{ value: 'low', label: t('supply.low') }, { value: 'out', label: t('supply.out') }]} />
        </Field>
        <Field label={t('supply.qty')} optional>
          <div className="grid grid-cols-[1fr_7rem] gap-2">
            <Input type="number" inputMode="decimal" className="num" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="2" />
            <NativeSelect value={unit} onChange={(e) => setUnit(e.target.value)} aria-label={t('supply.unit')}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </NativeSelect>
          </div>
        </Field>
        <Field label={t('supply.note')} optional>
          <Textarea rows={2} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder={t('supply.notePh')} />
        </Field>
      </div>
    </ResponsiveModal>
  );
}
