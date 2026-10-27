import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, Clock, Loader2, RefreshCw, RotateCcw, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { addDays, getTodayIST } from '../../utils/timezone';
import {
  getReview, getSummary, rescorePhoto, setFlag, uploadPhoto,
  type ReviewItem, type SummaryResponse, type WorkplaceLocation,
} from './workplaceApi';
import { AuthedPhoto } from './AuthedPhoto';
import { compressPhoto, fmt12, liveStatus, nowMinutesIST, scoreCls, statusMeta, timeOfIso } from './workplaceUtils';

type Props = { locations: WorkplaceLocation[]; threshold: number; initialLocation?: string | null };

const locKey = (l: { kind: string; id: string }) => `${l.kind}:${l.id}`;
const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const RANGES = [{ days: 1, label: 'Today' }, { days: 7, label: '7 days' }, { days: 14, label: '14 days' }, { days: 30, label: '30 days' }];

// Review / gallery for the owner, operations managers and each place's incharge: every check at a
// place over a date range with its photo, AI score, status and the reviewer's OK / needs-cleaning.
// Photos and people's names are marked data-ai-private so the Bunny chat never reads them.
export function WorkplaceReview({ locations, threshold, initialLocation }: Props) {
  const today = getTodayIST();
  const [loc, setLoc] = useState(() => (initialLocation && locations.some((l) => locKey(l) === initialLocation) ? initialLocation : locations[0] ? locKey(locations[0]) : ''));
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [person, setPerson] = useState('');
  const [itemFilter, setItemFilter] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'' | 'missed' | 'late' | 'flagged'>('');
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<ReviewItem | null>(null);

  useEffect(() => {
    if (initialLocation && locations.some((l) => locKey(l) === initialLocation)) setLoc(initialLocation);
  }, [initialLocation, locations]);

  const place = locations.find((l) => locKey(l) === loc) || null;

  const load = async () => {
    if (!place) return;
    setLoading(true);
    try {
      const [r, s] = await Promise.all([getReview(place.kind, place.id, from, to), getSummary(place.kind, place.id).catch(() => null)]);
      setItems(r.items);
      setSummary(s);
    } catch (e: any) {
      toast.error(e?.message || 'Could not load the checks');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [loc, from, to]);

  const setRange = (days: number) => { setTo(today); setFrom(addDays(today, -(days - 1))); };
  const changeFrom = (v: string) => {
    if (!v) return;
    setFrom(v);
    if (v > to) setTo(v);
    else if (addDays(v, 30) < to) setTo(addDays(v, 30));
  };
  const changeTo = (v: string) => {
    if (!v) return;
    const t = v > today ? today : v;
    setTo(t);
    if (t < from) setFrom(t);
    else if (addDays(t, -30) > from) setFrom(addDays(t, -30));
  };

  const nowMin = nowMinutesIST();
  const live = useMemo(() => items.map((it) => ({ ...it, status: liveStatus(it.date, today, nowMin, it.start, it.end, it.hasPhoto, it.late) })), [items, today, nowMin]);
  const people = useMemo(() => [...new Map(live.map((i) => [i.employeeId, i.personName])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [live]);
  const checks = useMemo(() => [...new Map(live.map((i) => [i.itemId, i.name])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [live]);
  const shown = live.filter((i) =>
    (!person || i.employeeId === person) &&
    (!itemFilter || i.itemId === itemFilter) &&
    (!lowOnly || (typeof i.aiScore === 'number' && i.aiScore < threshold && i.aiVerdict !== 'unclear_photo')) &&
    (!statusFilter || (statusFilter === 'missed' ? i.status === 'missed' : statusFilter === 'late' ? i.status === 'late' || i.status === 'done_late' : i.flag?.status === 'needs_cleaning')));
  const byDate = useMemo(() => {
    const m = new Map<string, typeof shown>();
    for (const i of shown) m.set(i.date, [...(m.get(i.date) || []), i]);
    return [...m.entries()];
  }, [shown]);

  const counts = {
    onTime: shown.filter((i) => i.status === 'done').length,
    late: shown.filter((i) => i.status === 'done_late' || i.status === 'late').length,
    missed: shown.filter((i) => i.status === 'missed').length,
    flagged: shown.filter((i) => i.flag?.status === 'needs_cleaning').length,
  };
  const scored = shown.filter((i) => typeof i.aiScore === 'number' && i.aiVerdict !== 'unclear_photo');
  const avg = scored.length ? Math.round((scored.reduce((s, i) => s + (i.aiScore || 0), 0) / scored.length) * 10) / 10 : null;

  const patch = (it: ReviewItem, p: Partial<ReviewItem>) => {
    const same = (x: ReviewItem) => x.date === it.date && x.employeeId === it.employeeId && x.itemId === it.itemId;
    setItems((list) => list.map((x) => (same(x) ? { ...x, ...p } : x)));
    setOpen((o) => (o && same(o) ? { ...o, ...p } : o));
  };

  const field = 'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base bg-white';

  if (!locations.length) return <p className="text-gray-600">No places to review.</p>;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-3">
        <div className="flex gap-2">
          <select value={loc} onChange={(e) => setLoc(e.target.value)} className={field} aria-label="Place">
            {locations.map((l) => <option key={locKey(l)} value={locKey(l)}>{l.name}{l.kind === 'production' ? ' (production)' : ''}</option>)}
          </select>
          <button onClick={load} disabled={loading} className="p-2.5 rounded-lg border border-gray-200 bg-white flex-shrink-0" aria-label="Refresh">
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {RANGES.map((r) => {
            const active = to === today && from === addDays(today, -(r.days - 1));
            return <button key={r.days} onClick={() => setRange(r.days)} className={`px-3 py-1.5 rounded-full text-sm border ${active ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-gray-700 border-gray-300'}`}>{r.label}</button>;
          })}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-gray-600">From<input type="date" value={from} max={today} onChange={(e) => changeFrom(e.target.value)} className={`${field} mt-0.5`} /></label>
          <label className="text-xs text-gray-600">To<input type="date" value={to} max={today} onChange={(e) => changeTo(e.target.value)} className={`${field} mt-0.5`} /></label>
        </div>
        <div className="grid grid-cols-2 gap-2" data-ai-private>
          <select value={person} onChange={(e) => setPerson(e.target.value)} className={field} aria-label="Person">
            <option value="">Everyone</option>
            {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select value={itemFilter} onChange={(e) => setItemFilter(e.target.value)} className={field} aria-label="Check">
            <option value="">All checks</option>
            {checks.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-1.5 items-center">
          <button onClick={() => setLowOnly((v) => !v)} className={`px-3 py-1.5 rounded-full text-sm border inline-flex items-center gap-1 ${lowOnly ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-700 border-gray-300'}`}>
            <Sparkles className="w-3.5 h-3.5" /> Score below {threshold}
          </button>
          {(['missed', 'late', 'flagged'] as const).map((s) => (
            <button key={s} onClick={() => setStatusFilter((v) => (v === s ? '' : s))} className={`px-3 py-1.5 rounded-full text-sm border ${statusFilter === s ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300'}`}>
              {s === 'missed' ? 'Missed' : s === 'late' ? 'Late' : 'Needs cleaning'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
        <Stat label="On time" value={counts.onTime} cls="text-emerald-700" />
        <Stat label="Late" value={counts.late} cls="text-amber-700" />
        <Stat label="Missed" value={counts.missed} cls="text-red-700" />
        <Stat label="Needs cleaning" value={counts.flagged} cls="text-red-700" />
        <Stat label="Avg AI score" value={avg === null ? '-' : `${avg}/10`} cls="text-gray-900" />
      </div>

      {loading && !items.length ? (
        <div className="py-12 flex justify-center text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : !shown.length ? (
        <p className="text-center text-gray-500 py-8">{items.length ? 'Nothing matches these filters.' : 'No checks for these dates. Set up the checklist and pick people in Setup.'}</p>
      ) : (
        <div className="space-y-5" data-ai-private>
          {byDate.map(([date, list]) => (
            <section key={date}>
              {byDate.length > 1 || date !== today ? <h3 className="text-sm font-semibold text-gray-700 mb-2">{dayLabel(date)}</h3> : null}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {list.map((it) => <Card key={`${it.date}|${it.employeeId}|${it.itemId}`} it={it} threshold={threshold} onOpen={() => setOpen(it)} />)}
              </div>
            </section>
          ))}
        </div>
      )}

      {summary && summary.people.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white p-3">
          <h3 className="font-semibold text-gray-900">This week · এই সপ্তাহ</h3>
          <p className="text-xs text-gray-500 mb-2">{dayLabel(summary.from)} to today - on time = photo sent before the window closed.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-gray-500"><th className="py-1 pr-2">Person</th><th className="py-1 px-2 text-right">On time</th><th className="py-1 px-2 text-right">Done</th><th className="py-1 px-2 text-right">Needs cleaning</th><th className="py-1 pl-2 text-right">AI avg</th></tr></thead>
              <tbody>
                {summary.people.map((p) => {
                  const pct = p.required ? Math.round((p.onTime / p.required) * 100) : 0;
                  return (
                    <tr key={p.employeeId} className="border-t border-gray-100">
                      <td className="py-1.5 pr-2" data-ai-private>{p.name}</td>
                      <td className={`py-1.5 px-2 text-right font-semibold ${pct >= 90 ? 'text-emerald-700' : pct >= 70 ? 'text-amber-700' : 'text-red-700'}`}>{pct}%</td>
                      <td className="py-1.5 px-2 text-right text-gray-600">{p.done}/{p.required}</td>
                      <td className="py-1.5 px-2 text-right text-gray-600">{p.needsCleaning}</td>
                      <td className="py-1.5 pl-2 text-right text-gray-600">{p.avgScore === null ? '-' : p.avgScore}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {open && place && <Detail it={open} place={place} threshold={threshold} onClose={() => setOpen(null)} onPatch={(p) => patch(open, p)} onReload={load} />}
    </div>
  );
}

function Stat({ label, value, cls }: { label: string; value: number | string; cls: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white py-2">
      <p className={`text-lg font-bold ${cls}`}>{value}</p>
      <p className="text-[11px] text-gray-500">{label}</p>
    </div>
  );
}

function Card({ it, threshold, onOpen }: { it: ReviewItem; threshold: number; onOpen: () => void }) {
  const meta = statusMeta(it.status, it.start, it.end);
  const flagged = it.flag?.status === 'needs_cleaning';
  return (
    <button onClick={onOpen} className={`text-left rounded-xl border bg-white overflow-hidden shadow-sm ${flagged ? 'border-red-300 ring-1 ring-red-200' : 'border-gray-200'}`}>
      <div className="relative">
        {it.hasPhoto ? (
          <AuthedPhoto date={it.date} employeeId={it.employeeId} itemId={it.itemId} thumb version={it.uploadedAt} className="w-full aspect-square" />
        ) : (
          <div className={`w-full aspect-square flex flex-col items-center justify-center ${it.status === 'missed' || it.status === 'late' ? 'bg-red-50 text-red-400' : 'bg-gray-50 text-gray-300'}`}>
            {it.status === 'missed' || it.status === 'late' ? <AlertTriangle className="w-8 h-8" /> : <Clock className="w-8 h-8" />}
          </div>
        )}
        {it.aiStatus === 'scored' && typeof it.aiScore === 'number' && (
          <span className={`absolute top-1.5 left-1.5 text-xs font-bold px-1.5 py-0.5 rounded-md ${it.aiVerdict === 'unclear_photo' ? 'bg-gray-700 text-white' : scoreCls(it.aiScore, threshold)}`}>
            {it.aiVerdict === 'unclear_photo' ? 'Unclear' : `${it.aiScore}/10`}
          </span>
        )}
        {it.aiStatus === 'failed' && <span className="absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0.5 rounded-md bg-gray-200 text-gray-700">Not scored</span>}
        {it.flag && (
          <span className={`absolute top-1.5 right-1.5 rounded-full p-0.5 ${flagged ? 'bg-red-600' : 'bg-emerald-600'}`}>
            {flagged ? <AlertTriangle className="w-3.5 h-3.5 text-white" /> : <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
          </span>
        )}
      </div>
      <div className="p-2">
        <p className="text-sm font-semibold text-gray-900 leading-tight truncate">{it.name}</p>
        <p className="text-xs text-gray-600 truncate">{it.personName}</p>
        <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full border ${meta.cls}`}>{meta.label.split(' · ')[0]}</span>
        {it.hasPhoto && it.uploadedAt && <span className="ml-1 text-[10px] text-gray-500">{timeOfIso(it.uploadedAt)}</span>}
      </div>
    </button>
  );
}

function Detail({ it, place, threshold, onClose, onPatch, onReload }: {
  it: ReviewItem; place: WorkplaceLocation; threshold: number; onClose: () => void; onPatch: (p: Partial<ReviewItem>) => void; onReload: () => void;
}) {
  const today = getTodayIST();
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [trend, setTrend] = useState<ReviewItem[] | null>(null);
  const flagged = it.flag?.status === 'needs_cleaning';

  // The same check over the 14 days up to this one, so a one-off can be told from a habit.
  useEffect(() => {
    let cancelled = false;
    setTrend(null);
    getReview(place.kind, place.id, addDays(it.date, -13), it.date)
      .then((r) => { if (!cancelled) setTrend(r.items.filter((x) => x.itemId === it.itemId).sort((a, b) => a.date.localeCompare(b.date))); })
      .catch(() => { if (!cancelled) setTrend([]); });
    return () => { cancelled = true; };
  }, [place.kind, place.id, it.date, it.itemId]);

  const decide = async (status: 'ok' | 'needs_cleaning') => {
    if (status === 'needs_cleaning' && !note.trim()) return toast.error('Write what needs cleaning');
    setSaving(true);
    try {
      const r = await setFlag({ date: it.date, employeeId: it.employeeId, itemId: it.itemId, status, note: note.trim() });
      onPatch({ flag: r.flag });
      setNote('');
      toast.success(status === 'ok' ? 'Marked OK' : 'Sent back for cleaning');
    } catch (e: any) {
      toast.error(e?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const rescore = async () => {
    setSaving(true);
    try {
      const r = await rescorePhoto({ date: it.date, employeeId: it.employeeId, itemId: it.itemId });
      const { success, flagged: newlyFlagged, ...view } = r;
      onPatch(view);
      toast[success ? 'success' : 'error'](success ? (newlyFlagged ? 'Scored - marked needs cleaning' : 'Scored') : 'Could not score it - try later');
    } catch (e: any) {
      toast.error(e?.message || 'Could not score the photo');
    } finally {
      setSaving(false);
    }
  };

  const takeForThem = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSaving(true);
    try {
      const { image, thumb } = await compressPhoto(file);
      const r = await uploadPhoto({ itemId: it.itemId, image, thumb, forEmployeeId: it.employeeId });
      onPatch({ ...r.item, itemId: it.itemId, status: r.item.status });
      toast.success('Photo saved, marked as taken by you');
      onReload();
    } catch (err: any) {
      toast.error(err?.message || 'Could not send the photo');
    } finally {
      setSaving(false);
    }
  };

  const meta = statusMeta(it.status, it.start, it.end);
  const canTakeForThem = !it.hasPhoto && it.date === today && (it.status === 'due' || it.status === 'late');

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center" data-ai-private>
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[94dvh] flex flex-col">
        <div className="flex items-start justify-between gap-3 p-4 border-b border-gray-200">
          <div className="min-w-0">
            <p className="font-bold text-gray-900">{it.name}{it.nameBn ? ` · ${it.nameBn}` : ''}</p>
            <p className="text-sm text-gray-600">{it.personName} · {dayLabel(it.date)}{it.start ? ` · ${fmt12(it.start)}-${fmt12(it.end)}` : ''}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-500" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-4 overflow-y-auto">
          {it.hasPhoto ? (
            <AuthedPhoto date={it.date} employeeId={it.employeeId} itemId={it.itemId} thumb={false} version={it.uploadedAt} fit="contain" className="w-full aspect-[4/3] rounded-xl bg-black" />
          ) : (
            <div className="w-full aspect-[4/3] rounded-xl bg-gray-50 flex items-center justify-center text-gray-400">No photo</div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={`text-xs px-2 py-0.5 rounded-full border ${meta.cls}`}>{meta.label}</span>
            {it.uploadedAt && <span className="text-gray-600">Sent {timeOfIso(it.uploadedAt)}</span>}
            {!!it.retakes && <span className="text-gray-500">{it.retakes} retake{it.retakes === 1 ? '' : 's'}</span>}
            {it.onBehalf && <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-800">Taken by {it.uploadedByName || 'a manager'} for them</span>}
          </div>

          {it.hasPhoto && (
            <div className="rounded-xl border border-gray-200 p-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-gray-900 inline-flex items-center gap-1"><Sparkles className="w-4 h-4 text-orange-500" /> AI hygiene check</p>
                {it.aiStatus === 'scored' && typeof it.aiScore === 'number' && (
                  <span className={`text-sm font-bold px-2 py-0.5 rounded-md ${it.aiVerdict === 'unclear_photo' ? 'bg-gray-700 text-white' : scoreCls(it.aiScore, threshold)}`}>
                    {it.aiVerdict === 'unclear_photo' ? 'Unclear photo' : `${it.aiScore}/10`}
                  </span>
                )}
              </div>
              {it.aiStatus === 'scored' ? (
                <>
                  <p className="text-sm text-gray-700">{it.aiVerdict === 'clean' ? 'Clean' : it.aiVerdict === 'needs_cleaning' ? 'Needs cleaning' : 'Photo unclear - ask for a retake'}{it.aiShown ? ` - ${it.aiShown}` : ''}</p>
                  {it.aiIssues?.length ? <ul className="text-sm text-gray-800 list-disc pl-5">{it.aiIssues.map((s, i) => <li key={i}>{s}{it.aiIssuesBengali?.[i] ? <span className="text-gray-500"> · {it.aiIssuesBengali[i]}</span> : null}</li>)}</ul> : null}
                </>
              ) : (
                <p className="text-sm text-gray-600">{it.aiStatus === 'failed' ? 'Not scored - the AI check failed.' : it.aiStatus === 'pending' ? 'Being scored…' : 'AI checks are off.'}</p>
              )}
              {(it.aiStatus === 'failed' || it.aiStatus === 'scored') && (
                <button onClick={rescore} disabled={saving} className="text-sm text-orange-700 font-semibold inline-flex items-center gap-1 disabled:opacity-50">
                  <RotateCcw className="w-4 h-4" /> {it.aiStatus === 'failed' ? 'Retry scoring' : 'Score again'}
                </button>
              )}
            </div>
          )}

          {trend && trend.length > 1 && (
            <div className="rounded-xl border border-gray-200 p-3">
              <p className="text-sm font-semibold text-gray-900 mb-2">Last 14 days</p>
              <div className="flex items-end gap-1 h-20">
                {trend.map((t) => {
                  const s = typeof t.aiScore === 'number' && t.aiVerdict !== 'unclear_photo' ? t.aiScore : null;
                  const missed = !t.hasPhoto && t.status === 'missed';
                  return (
                    <div key={t.date + t.employeeId} className="flex-1 flex flex-col items-center justify-end h-full" title={`${dayLabel(t.date)}: ${s !== null ? `${s}/10` : missed ? 'missed' : 'no score'}`}>
                      {s !== null ? (
                        <div className={`w-full rounded-t ${scoreCls(s, threshold)}`} style={{ height: `${Math.max(8, s * 10)}%` }} />
                      ) : (
                        <div className={`w-full text-center text-[10px] ${missed ? 'text-red-500' : 'text-gray-300'}`}>{missed ? '✕' : '·'}</div>
                      )}
                      <span className={`text-[9px] mt-0.5 ${t.date === it.date ? 'font-bold text-gray-900' : 'text-gray-400'}`}>{Number(t.date.slice(8))}</span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-gray-500 mt-1">Bar = AI score, ✕ = missed.</p>
            </div>
          )}

          {it.flag && (
            <div className={`rounded-xl p-3 text-sm ${flagged ? 'bg-red-50 text-red-900' : 'bg-emerald-50 text-emerald-900'}`}>
              <p className="font-semibold">{flagged ? 'Needs cleaning' : 'Checked OK'} - {it.flag.auto ? 'set by the AI check' : `by ${it.flag.by}`}, {timeOfIso(it.flag.at)}</p>
              {it.flag.note && <p className="mt-0.5">{it.flag.note}</p>}
              {flagged && it.flag.fixedAt && <p className="text-xs mt-1">New photo sent at {timeOfIso(it.flag.fixedAt)} - check it and mark OK if it's clean.</p>}
            </div>
          )}

          {it.hasPhoto && (
            <div className="space-y-2">
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={300} placeholder="Note for them (needed for 'Needs cleaning')" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base" />
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => decide('ok')} disabled={saving} className="py-3 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-60 inline-flex items-center justify-center gap-1"><CheckCircle2 className="w-4 h-4" /> OK</button>
                <button onClick={() => decide('needs_cleaning')} disabled={saving} className="py-3 rounded-xl bg-red-600 text-white font-semibold disabled:opacity-60 inline-flex items-center justify-center gap-1"><AlertTriangle className="w-4 h-4" /> Needs cleaning</button>
              </div>
              <p className="text-[11px] text-gray-500">"Needs cleaning" sends them a notification with your note. OK overrides the AI.</p>
            </div>
          )}

          {canTakeForThem && (
            <label className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-violet-300 text-violet-800 text-sm font-semibold ${saving ? 'opacity-50' : 'cursor-pointer'}`}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />} Take the photo for them (recorded as taken by you)
              <input type="file" accept="image/*" capture="environment" className="hidden" disabled={saving} onChange={takeForThem} />
            </label>
          )}
        </div>
      </div>
    </div>
  );
}
