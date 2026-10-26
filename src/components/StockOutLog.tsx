import { useEffect, useMemo, useState } from 'react';
import { PackageX, RefreshCw, Loader2, Plus, CheckCircle2, AlertTriangle, Trash2, Pencil, X } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import * as api from '../utils/api';
import { getTodayIST, addDays } from '../utils/timezone';
import {
  STOCK_OUT_ITEMS, STOCK_OUT_REASONS, StockOutEntry, StockOutReason, categoryForItem, istClock, istDate, istTime, istToISO,
  stockOutDuration, stockOutReasonLabel,
} from '../utils/stockOuts';

type Props = {
  accessToken: string;
  stores: { id: string; name: string }[];
  defaultStoreId: string | null;
  canDelete: boolean;
};

const OTHER_ITEM = '__other__';
const nowIso = () => new Date().toISOString();
const shortDay = (iso: string) => new Date(`${istDate(iso)}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

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

// Out-of-stock log for whoever is billing (store SOP ST-28): mark an item out with the reason
// and the time it ran out, then mark it back when stock arrives. Zomato/Swiggy are switched
// off in Ciferon; counter customers are told and offered something else.
export function StockOutLog({ accessToken, stores, defaultStoreId, canDelete }: Props) {
  const [storeId, setStoreId] = useState(defaultStoreId || stores[0]?.id || '');
  const [entries, setEntries] = useState<StockOutEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StockOutEntry | null>(null);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState<{ id: string; date: string; time: string; backOnline: boolean } | null>(null);
  const [, setTick] = useState(0);

  // Keeps the "since" durations moving.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  const load = async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const today = getTodayIST();
      setEntries(await api.getStockOuts(accessToken, storeId, addDays(today, -6), today));
    } catch {
      toast.error('Could not load the out-of-stock list');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [accessToken, storeId]);

  const open = useMemo(() => entries.filter((e) => !e.endAt), [entries]);
  const recent = useMemo(() => entries.filter((e) => !!e.endAt), [entries]);

  const set = (patch: Partial<FormValues>) => setForm((f) => ({ ...f, ...patch }));

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
    if (!item) return toast.error('Pick the item that ran out');
    if (!form.reason) return toast.error('Pick why it ran out');
    if (form.reason === 'other' && !form.reasonNote.trim()) return toast.error('Write why it ran out');
    const startAt = istToISO(form.startDate, form.startTime);
    if (startAt > nowIso()) return toast.error('The start time is in the future');
    const endAt = form.ended ? istToISO(form.endDate, form.endTime) : null;
    if (endAt && endAt < startAt) return toast.error('Back-in-stock time is before the start time');
    if (!editing && open.some((e) => e.item.toLowerCase() === item.toLowerCase())) {
      return toast.error(`${item} is already marked out of stock`);
    }
    setSaving(true);
    try {
      const payload = {
        item, category: categoryForItem(item), reason: form.reason, reasonNote: form.reasonNote.trim() || undefined,
        startAt, endAt, offOnline: form.offOnline, backOnline: form.ended ? form.backOnline : undefined,
      };
      if (editing) {
        await api.updateStockOut(accessToken, storeId, editing.id, payload);
        toast.success('Updated');
      } else {
        await api.createStockOut(accessToken, { storeId, ...payload });
        toast.success(endAt ? `${item} logged` : `${item} marked out of stock`);
      }
      setFormOpen(false);
      setEditing(null);
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const markBack = async () => {
    if (!closing) return;
    const entry = entries.find((e) => e.id === closing.id);
    if (!entry) return;
    const endAt = istToISO(closing.date, closing.time);
    if (endAt < entry.startAt) return toast.error('Back-in-stock time is before it ran out');
    if (endAt > nowIso()) return toast.error('That time is in the future');
    setSaving(true);
    try {
      await api.updateStockOut(accessToken, storeId, entry.id, { endAt, backOnline: closing.backOnline });
      toast.success(`${entry.item} is back in stock`);
      setClosing(null);
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (e: StockOutEntry) => {
    if (!window.confirm(`Delete the ${e.item} entry? Only do this if it was logged by mistake.`)) return;
    try {
      await api.deleteStockOut(accessToken, storeId, e.id);
      toast.success('Deleted');
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Could not delete');
    }
  };

  const field = 'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base bg-white';

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><PackageX className="w-6 h-6 text-rose-600" /> Out of Stock</h1>
          <p className="text-sm text-gray-500">Log every item that runs out, why, and when it is back.</p>
        </div>
        <button onClick={load} disabled={loading} className="p-2 rounded-lg border border-gray-200 bg-white" aria-label="Refresh">
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {stores.length > 1 && (
        <select value={storeId} onChange={(e) => setStoreId(e.target.value)} className={field} aria-label="Store">
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 space-y-1">
        <p><span className="font-semibold">Online:</span> switch the item off in Ciferon so Zomato and Swiggy stop taking it.</p>
        <p><span className="font-semibold">Counter:</span> tell the customer and offer another item.</p>
        <p><span className="font-semibold">Then</span> log it here, and mark it back the moment stock arrives.</p>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Out right now</h2>
        {loading && entries.length === 0 ? (
          <div className="flex items-center gap-2 text-gray-500 text-sm py-6 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
        ) : open.length === 0 ? (
          <p className="text-sm text-gray-500 bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Everything is in stock.</p>
        ) : (
          <div className="space-y-3">
            {open.map((e) => (
              <div key={e.id} className="bg-white border-2 border-rose-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">{e.item}</p>
                    <p className="text-sm text-gray-600">
                      Since {istClock(e.startAt)}{istDate(e.startAt) !== getTodayIST() ? ` ${shortDay(e.startAt)}` : ''} · <span className="font-semibold text-rose-700">{stockOutDuration(e.startAt)}</span>
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{stockOutReasonLabel(e.reason)}{e.reasonNote ? ` - ${e.reasonNote}` : ''} · by {e.createdByName}</p>
                  </div>
                  <button onClick={() => startEdit(e)} className="p-1.5 text-gray-500 flex-shrink-0" aria-label={`Edit ${e.item}`}><Pencil className="w-4 h-4" /></button>
                </div>
                {!e.offOnline && (
                  <p className="mt-2 text-xs text-amber-800 bg-amber-50 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> Not marked as switched off in Ciferon - online orders may still come in.</p>
                )}
                {closing?.id === e.id ? (
                  <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                    <p className="text-sm font-medium text-gray-700">Back in stock at</p>
                    <div className="grid grid-cols-2 gap-2">
                      <input type="date" value={closing.date} max={getTodayIST()} onChange={(ev) => setClosing({ ...closing, date: ev.target.value })} className={field} aria-label="Back in stock date" />
                      <input type="time" value={closing.time} onChange={(ev) => setClosing({ ...closing, time: ev.target.value })} className={field} aria-label="Back in stock time" />
                    </div>
                    {e.offOnline && (
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" checked={closing.backOnline} onChange={(ev) => setClosing({ ...closing, backOnline: ev.target.checked })} className="w-5 h-5" />
                        Switched back on in Ciferon
                      </label>
                    )}
                    <div className="flex gap-2">
                      <button onClick={markBack} disabled={saving} className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold disabled:opacity-60">{saving ? 'Saving...' : 'Save'}</button>
                      <button onClick={() => setClosing(null)} className="px-4 py-2.5 border border-gray-300 rounded-lg">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { const now = nowIso(); setClosing({ id: e.id, date: istDate(now), time: istTime(now), backOnline: false }); }}
                    className="mt-3 w-full px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold inline-flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-5 h-5" /> Back in stock
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {!formOpen ? (
        <button onClick={startNew} className="w-full px-4 py-3 bg-rose-600 text-white rounded-xl font-semibold inline-flex items-center justify-center gap-2 shadow-sm">
          <Plus className="w-5 h-5" /> Mark an item out of stock
        </button>
      ) : (
        <section className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">{editing ? `Edit ${editing.item}` : 'Mark an item out of stock'}</h2>
            <button onClick={() => { setFormOpen(false); setEditing(null); }} className="p-1.5 text-gray-500" aria-label="Close"><X className="w-5 h-5" /></button>
          </div>

          <div>
            <label htmlFor="so-item" className="block text-sm font-medium text-gray-700 mb-1">Item *</label>
            <select id="so-item" value={form.item} onChange={(e) => set({ item: e.target.value })} className={field}>
              <option value="">Pick the item...</option>
              {STOCK_OUT_ITEMS.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.items.map((i) => <option key={i} value={i}>{i}</option>)}
                </optgroup>
              ))}
              <option value={OTHER_ITEM}>Other item (type it)</option>
            </select>
            {form.item === OTHER_ITEM && (
              <input value={form.otherItem} onChange={(e) => set({ otherItem: e.target.value })} placeholder="e.g. Chicken Momo Burger" className={`${field} mt-2`} aria-label="Item name" />
            )}
          </div>

          <div>
            <p className="block text-sm font-medium text-gray-700 mb-1">Why did it run out? *</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Reason">
              {STOCK_OUT_REASONS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  role="radio"
                  aria-checked={form.reason === r.id}
                  onClick={() => set({ reason: r.id })}
                  className={`text-left px-3 py-2 rounded-lg border text-sm ${form.reason === r.id ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-gray-800 border-gray-300'}`}
                >
                  <span className="font-semibold">{r.label}</span>
                  <span className={`block text-xs ${form.reason === r.id ? 'text-rose-100' : 'text-gray-500'}`}>{r.hint}</span>
                </button>
              ))}
            </div>
            <input
              value={form.reasonNote}
              onChange={(e) => set({ reasonNote: e.target.value })}
              placeholder={form.reason === 'other' ? 'Write why (required)' : 'More detail (optional)'}
              className={`${field} mt-2`}
              aria-label="Reason detail"
            />
          </div>

          <div>
            <p className="block text-sm font-medium text-gray-700 mb-1">Out of stock from *</p>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={form.startDate} max={getTodayIST()} onChange={(e) => set({ startDate: e.target.value })} className={field} aria-label="Out of stock date" />
              <input type="time" value={form.startTime} onChange={(e) => set({ startTime: e.target.value })} className={field} aria-label="Out of stock time" />
            </div>
          </div>

          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.offOnline} onChange={(e) => set({ offOnline: e.target.checked })} className="w-5 h-5 mt-0.5" />
            <span>Switched off on Zomato and Swiggy in Ciferon</span>
          </label>

          <div className="border-t border-gray-100 pt-3 space-y-2">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={form.ended} onChange={(e) => set({ ended: e.target.checked })} className="w-5 h-5" />
              Already back in stock
            </label>
            {form.ended && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" value={form.endDate} max={getTodayIST()} onChange={(e) => set({ endDate: e.target.value })} className={field} aria-label="Back in stock date" />
                  <input type="time" value={form.endTime} onChange={(e) => set({ endTime: e.target.value })} className={field} aria-label="Back in stock time" />
                </div>
                {form.offOnline && (
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={form.backOnline} onChange={(e) => set({ backOnline: e.target.checked })} className="w-5 h-5" />
                    Switched back on in Ciferon
                  </label>
                )}
              </>
            )}
          </div>

          <button onClick={submit} disabled={saving} className="w-full px-4 py-3 bg-rose-600 text-white rounded-lg font-semibold disabled:opacity-60">
            {saving ? 'Saving...' : editing ? 'Save changes' : form.ended ? 'Log it' : 'Mark out of stock'}
          </button>
        </section>
      )}

      {recent.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Last 7 days</h2>
          <ul className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
            {recent.map((e) => (
              <li key={e.id} className="p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{e.item}</p>
                  <p className="text-xs text-gray-600 tabular-nums">
                    {shortDay(e.startAt)} · {istClock(e.startAt)} - {istClock(e.endAt!)}{istDate(e.endAt!) !== istDate(e.startAt) ? ` ${shortDay(e.endAt!)}` : ''} · {stockOutDuration(e.startAt, e.endAt)}
                  </p>
                  <p className="text-xs text-gray-500">{stockOutReasonLabel(e.reason)}{e.reasonNote ? ` - ${e.reasonNote}` : ''} · by {e.createdByName}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => startEdit(e)} className="p-1.5 text-gray-500" aria-label={`Edit ${e.item}`}><Pencil className="w-4 h-4" /></button>
                  {canDelete && <button onClick={() => remove(e)} className="p-1.5 text-gray-500 hover:text-red-600" aria-label={`Delete ${e.item}`}><Trash2 className="w-4 h-4" /></button>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
