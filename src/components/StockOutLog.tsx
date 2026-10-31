import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, PackageX, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from './ui/sonner';
import { confirm } from './ui/confirm';
import { Button } from './ui/button';
import { Callout } from './ui/callout';
import { Checkbox } from './ui/checkbox';
import { EmptyState } from './ui/empty-state';
import { ErrorState } from './ui/error-state';
import { Field } from './ui/field';
import { IconButton } from './ui/icon-button';
import { Input } from './ui/input';
import { ListGroup, ListRow } from './ui/list-row';
import { NativeSelect } from './ui/select';
import { ResponsiveModal } from './ui/responsive-modal';
import { SkeletonListRows } from './ui/skeleton';
import { cn } from './ui/utils';
import { t as tSaved, useT } from '../utils/i18n';
import * as api from '../utils/api';
import { isNetworkError, isOnline } from '../utils/http';
import { getTodayIST, addDays } from '../utils/timezone';
import {
  STOCK_OUT_ITEMS, STOCK_OUT_REASONS, StockOutEntry, StockOutReason, categoryForItem, istClock, istDate, istTime, istToISO,
  stockOutDuration,
} from '../utils/stockOuts';
import { StickyActions, StockPage, dayLabel, reasonLabel } from './stock/stockShared';
import { useRefreshSignal } from './shell/refreshSignal';

type Props = {
  accessToken: string;
  stores: { id: string; name: string }[];
  defaultStoreId: string | null;
  canDelete: boolean;
};

const OTHER_ITEM = '__other__';
const nowIso = () => new Date().toISOString();

type FormValues = {
  item: string;
  otherItem: string;
  reason: StockOutReason | '';
  reasonNote: string;
  startDate: string;
  startTime: string;
  offOnline: boolean;
  ended: boolean;
  endDate: string;
  endTime: string;
  backOnline: boolean;
};

function emptyForm(): FormValues {
  const now = nowIso();
  return {
    item: '', otherItem: '', reason: '', reasonNote: '',
    startDate: istDate(now), startTime: istTime(now), offOnline: false,
    ended: false, endDate: istDate(now), endTime: istTime(now), backOnline: false,
  };
}

function formFromEntry(e: StockOutEntry): FormValues {
  const known = STOCK_OUT_ITEMS.some((g) => g.items.includes(e.item));
  const end = e.endAt || nowIso();
  return {
    item: known ? e.item : OTHER_ITEM, otherItem: known ? '' : e.item, reason: e.reason, reasonNote: e.reasonNote || '',
    startDate: istDate(e.startAt), startTime: istTime(e.startAt), offOnline: e.offOnline,
    ended: !!e.endAt, endDate: istDate(end), endTime: istTime(end), backOnline: !!e.backOnline,
  };
}

/** A whole-row tappable tick (44 px+). */
function CheckRow({ id, checked, onChange, children }: { id: string; checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label htmlFor={id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-border bg-surface px-3 py-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <span className="text-body-sm text-text">{children}</span>
    </label>
  );
}

// Out-of-stock log for whoever is billing (store SOP ST-28): mark an item out with the reason
// and the time it ran out, then mark it back when stock arrives. Zomato/Swiggy are switched
// off in Ciferon; counter customers are told and offered something else.
//
// Offline: these entries go straight to the server. With no signal the form stays filled and
// says nothing was saved; a phone-side queue needs a 'stock-out' kind in utils/outbox.ts.
export function StockOutLog({ accessToken, stores, defaultStoreId, canDelete }: Props) {
  const { t, lang } = useT();
  const [storeId, setStoreId] = useState(defaultStoreId || stores[0]?.id || '');
  const [entries, setEntries] = useState<StockOutEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StockOutEntry | null>(null);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState<{ id: string; date: string; time: string; backOnline: boolean } | null>(null);
  const [, setTick] = useState(0);

  // Keeps the "since" durations moving.
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const load = async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const today = getTodayIST();
      setEntries(await api.getStockOuts(accessToken, storeId, addDays(today, -6), today));
      setLoadError(null);
    } catch (err: any) {
      setLoadError(err?.message || tSaved('error.body'));
      toast.error(tSaved('stock.so.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [accessToken, storeId]);
  useRefreshSignal(load);

  const open = useMemo(() => entries.filter((e) => !e.endAt), [entries]);
  const recent = useMemo(() => entries.filter((e) => !!e.endAt), [entries]);
  const set = (patch: Partial<FormValues>) => setForm((f) => ({ ...f, ...patch }));
  const reasonOf = (e: StockOutEntry) => {
    const def = STOCK_OUT_REASONS.find((r) => r.id === e.reason);
    return `${def ? reasonLabel(lang, 'soReason', def.id, def.label) : reasonLabel(lang, 'soReason', 'other', 'No reason')}${e.reasonNote ? ` - ${e.reasonNote}` : ''}`;
  };
  const failed = (err: any) => {
    // No signal: the server never saw it, so say so plainly and keep what was typed.
    if (isNetworkError(err) || !isOnline()) toast.error(tSaved('stock.so.offline'));
    else toast.error(err?.message || tSaved('stock.so.saveFailed'));
  };

  const startNew = () => {
    setEditing(null);
    setForm(emptyForm());
    setFormOpen(true);
  };

  const startEdit = (e: StockOutEntry) => {
    setEditing(e);
    setForm(formFromEntry(e));
    setFormOpen(true);
  };

  const submit = async () => {
    const item = form.item === OTHER_ITEM ? form.otherItem.trim() : form.item;
    if (!item) return toast.error(tSaved('stock.so.pickItemErr'));
    if (!form.reason) return toast.error(tSaved('stock.so.pickReasonErr'));
    if (form.reason === 'other' && !form.reasonNote.trim()) return toast.error(tSaved('stock.so.writeReasonErr'));
    const startAt = istToISO(form.startDate, form.startTime);
    if (startAt > nowIso()) return toast.error(tSaved('stock.so.futureStart'));
    const endAt = form.ended ? istToISO(form.endDate, form.endTime) : null;
    if (endAt && endAt < startAt) return toast.error(tSaved('stock.so.endBeforeStart'));
    if (!editing && open.some((e) => e.item.toLowerCase() === item.toLowerCase())) {
      return toast.error(tSaved('stock.so.alreadyOut', { item }));
    }
    setSaving(true);
    try {
      const payload = {
        item, category: categoryForItem(item), reason: form.reason, reasonNote: form.reasonNote.trim() || undefined,
        startAt, endAt, offOnline: form.offOnline, backOnline: form.ended ? form.backOnline : undefined,
      };
      if (editing) {
        await api.updateStockOut(accessToken, storeId, editing.id, payload);
        toast.success(tSaved('stock.so.updated'));
      } else {
        await api.createStockOut(accessToken, { storeId, ...payload });
        toast.success(endAt ? tSaved('stock.so.logged', { item }) : tSaved('stock.so.markedOut', { item }));
      }
      setFormOpen(false);
      setEditing(null);
      await load();
    } catch (err: any) {
      failed(err);
    } finally {
      setSaving(false);
    }
  };

  const markBack = async () => {
    if (!closing) return;
    const entry = entries.find((e) => e.id === closing.id);
    if (!entry) return;
    const endAt = istToISO(closing.date, closing.time);
    if (endAt < entry.startAt) return toast.error(tSaved('stock.so.endBeforeStart'));
    if (endAt > nowIso()) return toast.error(tSaved('stock.so.futureEnd'));
    setSaving(true);
    try {
      await api.updateStockOut(accessToken, storeId, entry.id, { endAt, backOnline: closing.backOnline });
      toast.success(tSaved('stock.so.backToast', { item: entry.item }));
      setClosing(null);
      await load();
    } catch (err: any) {
      failed(err);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (e: StockOutEntry) => {
    const ok = await confirm({ title: t('stock.so.deleteTitle', { item: e.item }), body: t('stock.so.deleteBody'), confirmLabel: t('stock.so.deleteConfirm'), tone: 'danger' });
    if (!ok) return;
    try {
      await api.deleteStockOut(accessToken, storeId, e.id);
      toast.success(tSaved('stock.so.deleted'));
      await load();
    } catch (err: any) {
      failed(err);
    }
  };

  const closingEntry = closing ? entries.find((e) => e.id === closing.id) || null : null;
  const formDirty = formOpen && (editing ? JSON.stringify(form) !== JSON.stringify(formFromEntry(editing)) : !!(form.item || form.reason || form.reasonNote));

  return (
    <StockPage lang={lang}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <h1 className="text-title font-semibold text-text">{t('stock.so.title')}</h1>
          {!loading && <p className="num text-body-sm text-text-2">{t('stock.so.summary', { open: open.length, logged: entries.length })}</p>}
        </div>
        <IconButton label={t('shell.refresh')} icon={<RefreshCw className={loading ? 'animate-spin' : undefined} />} disabled={loading} onClick={load} />
      </div>

      {stores.length > 1 && (
        <Field label={t('stock.so.store')}>
          <NativeSelect value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </NativeSelect>
        </Field>
      )}

      <Callout tone="neutral" title={t('stock.so.howTitle')}>{t('stock.so.howBody')}</Callout>

      <section className="flex flex-col gap-3" aria-labelledby="so-open">
        <h2 id="so-open" className="text-subtitle font-semibold text-text">{t('stock.so.outNow')}</h2>
        {loading && entries.length === 0 ? (
          <SkeletonListRows count={2} />
        ) : loadError && entries.length === 0 ? (
          <ErrorState body={loadError} onRetry={load} retrying={loading} />
        ) : open.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface">
            <EmptyState compact icon={CheckCircle2} title={t('stock.so.allInStock')} />
          </div>
        ) : (
          open.map((e) => (
            <article key={e.id} className="flex flex-col gap-3 rounded-lg border border-danger-border bg-surface p-4">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-danger-soft text-danger [&_svg]:size-5" aria-hidden="true"><PackageX /></span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-body-md font-semibold text-text">{e.item}</span>
                  <span className="num text-label text-text-2">
                    {t('stock.so.since', { time: `${istClock(e.startAt)}${istDate(e.startAt) !== getTodayIST() ? ` ${dayLabel(lang, istDate(e.startAt))}` : ''}` })} · <span className="font-semibold text-danger">{stockOutDuration(e.startAt)}</span>
                  </span>
                  <span className="text-label text-text-3">{reasonOf(e)} · {t('stock.so.by', { name: e.createdByName })}</span>
                </div>
                <IconButton label={t('stock.so.edit', { item: e.item })} icon={<Pencil />} onClick={() => startEdit(e)} />
              </div>
              {!e.offOnline && <Callout tone="warning" icon={AlertTriangle} title={t('stock.so.notOffline')} />}
              <Button
                variant="secondary"
                size="lg"
                leadingIcon={<CheckCircle2 />}
                onClick={() => { const now = nowIso(); setClosing({ id: e.id, date: istDate(now), time: istTime(now), backOnline: false }); }}
              >
                {t('stock.so.backInStock')}
              </Button>
            </article>
          ))
        )}
      </section>

      <ListGroup title={t('stock.so.last7')} empty={!loading ? <EmptyState compact icon={PackageX} title={t('stock.so.noneLast7')} /> : undefined}>
        {recent.map((e) => (
          <ListRow
            key={e.id}
            title={e.item}
            subtitle={`${dayLabel(lang, istDate(e.startAt))} · ${istClock(e.startAt)} - ${istClock(e.endAt!)}${istDate(e.endAt!) !== istDate(e.startAt) ? ` ${dayLabel(lang, istDate(e.endAt!))}` : ''} · ${stockOutDuration(e.startAt, e.endAt)} · ${reasonOf(e)}`}
            trailing={
              <span className="flex shrink-0 items-center">
                <IconButton label={t('stock.so.edit', { item: e.item })} icon={<Pencil />} onClick={() => startEdit(e)} />
                {canDelete && <IconButton label={t('stock.so.deleteConfirm')} icon={<Trash2 />} variant="danger-ghost" onClick={() => remove(e)} />}
              </span>
            }
          />
        ))}
      </ListGroup>

      <StickyActions>
        <Button size="lg" className="flex-1" leadingIcon={<Plus />} onClick={startNew}>{t('stock.so.markOut')}</Button>
      </StickyActions>

      {/* Mark out of stock / edit */}
      <ResponsiveModal
        open={formOpen}
        onOpenChange={(o) => { if (!o) { setFormOpen(false); setEditing(null); } }}
        dirty={formDirty && !saving}
        title={editing ? t('stock.so.edit', { item: editing.item }) : t('stock.so.markOut')}
        footer={
          <Button size="lg" className="flex-1" loading={saving} onClick={submit}>
            {editing ? t('stock.so.saveChanges') : form.ended ? t('stock.so.logIt') : t('stock.so.markOutButton')}
          </Button>
        }
      >
        <div className="flex flex-col gap-5" lang={lang}>
          <Field label={t('stock.so.item')} required>
            <NativeSelect value={form.item} onChange={(e) => set({ item: e.target.value })}>
              <option value="">{t('stock.so.pickItem')}</option>
              {STOCK_OUT_ITEMS.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.items.map((i) => <option key={i} value={i}>{i}</option>)}
                </optgroup>
              ))}
              <option value={OTHER_ITEM}>{t('stock.so.otherItem')}</option>
            </NativeSelect>
          </Field>
          {form.item === OTHER_ITEM && (
            <Field label={t('stock.so.itemName')} required>
              <Input value={form.otherItem} onChange={(e) => set({ otherItem: e.target.value })} placeholder="Chicken Momo Burger" />
            </Field>
          )}

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-body-sm font-medium text-text">{t('stock.so.why')} <span className="text-danger" aria-hidden="true">*</span></legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t('stock.so.why')}>
              {STOCK_OUT_REASONS.map((r) => {
                const on = form.reason === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => set({ reason: r.id })}
                    className={cn(
                      'flex min-h-12 flex-col rounded-md border px-3 py-2 text-left outline-none transition-colors duration-(--dur-fast) focus-visible:ring-2 focus-visible:ring-ring',
                      on ? 'border-primary bg-primary-soft' : 'border-border-strong bg-surface hover:bg-surface-2',
                    )}
                  >
                    <span className={cn('text-body-sm font-semibold', on ? 'text-primary' : 'text-text')}>{reasonLabel(lang, 'soReason', r.id, r.label)}</span>
                    <span className="text-caption text-text-3">{reasonLabel(lang, 'soReasonHint', r.id, r.hint)}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
          <Field label={form.reason === 'other' ? t('stock.so.whyRequired') : t('stock.so.whyDetail')} required={form.reason === 'other'} optional={form.reason !== 'other'}>
            <Input value={form.reasonNote} onChange={(e) => set({ reasonNote: e.target.value })} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={`${t('stock.so.from')} · ${t('stock.so.date')}`} required>
              <Input type="date" value={form.startDate} max={getTodayIST()} onChange={(e) => set({ startDate: e.target.value })} />
            </Field>
            <Field label={t('stock.so.time')} required>
              <Input type="time" value={form.startTime} onChange={(e) => set({ startTime: e.target.value })} />
            </Field>
          </div>

          <CheckRow id="so-off-online" checked={form.offOnline} onChange={(v) => set({ offOnline: v })}>{t('stock.so.offOnline')}</CheckRow>
          <CheckRow id="so-ended" checked={form.ended} onChange={(v) => set({ ended: v })}>{t('stock.so.alreadyBack')}</CheckRow>
          {form.ended && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label={`${t('stock.so.backAt')} · ${t('stock.so.date')}`}>
                  <Input type="date" value={form.endDate} max={getTodayIST()} onChange={(e) => set({ endDate: e.target.value })} />
                </Field>
                <Field label={t('stock.so.time')}>
                  <Input type="time" value={form.endTime} onChange={(e) => set({ endTime: e.target.value })} />
                </Field>
              </div>
              {form.offOnline && <CheckRow id="so-back-online" checked={form.backOnline} onChange={(v) => set({ backOnline: v })}>{t('stock.so.switchedBackOn')}</CheckRow>}
            </>
          )}
        </div>
      </ResponsiveModal>

      {/* Back in stock */}
      <ResponsiveModal
        open={!!closing}
        onOpenChange={(o) => { if (!o) setClosing(null); }}
        title={t('stock.so.backInStock')}
        description={closingEntry?.item}
        footer={<Button size="lg" className="flex-1" loading={saving} onClick={markBack}>{t('common.save')}</Button>}
      >
        {closing && (
          <div className="flex flex-col gap-4" lang={lang}>
            <div className="grid grid-cols-2 gap-3">
              <Field label={`${t('stock.so.backAt')} · ${t('stock.so.date')}`}>
                <Input type="date" value={closing.date} max={getTodayIST()} onChange={(ev) => setClosing({ ...closing, date: ev.target.value })} />
              </Field>
              <Field label={t('stock.so.time')}>
                <Input type="time" value={closing.time} onChange={(ev) => setClosing({ ...closing, time: ev.target.value })} />
              </Field>
            </div>
            {closingEntry?.offOnline && (
              <CheckRow id="so-close-online" checked={closing.backOnline} onChange={(v) => setClosing({ ...closing, backOnline: v })}>{t('stock.so.switchedBackOn')}</CheckRow>
            )}
          </div>
        )}
      </ResponsiveModal>
    </StockPage>
  );
}
