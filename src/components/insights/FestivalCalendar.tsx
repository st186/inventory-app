import { useEffect, useState } from 'react';
import { CalendarDays, Plus, Sparkles, Trash2, Check, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { confirm } from '../ui/confirm';
import * as api from '../../utils/api';
import { DAY_EFFECTS, addDaysISO, type CalendarEvent, type DayEffect } from '../../utils/forecast';
import { getTodayIST } from '../../utils/timezone';
import { EFFECT_CHIP, effectLabel } from './ForecastCard';
import { fmtDay } from './useInsightsOverview';

// The festival / event calendar the forecast reads. The owner side adds days by hand or
// adds days the AI drafts (it checks lunar festival dates with a web search). Drafted days
// wait on the server until someone adds or skips them; a draft also runs every Monday.
export function FestivalCalendar({ accessToken, events, canManage, onChanged }: {
  accessToken: string;
  events: CalendarEvent[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const today = getTodayIST();
  const [form, setForm] = useState<{ date: string; name: string; effect: DayEffect; note: string }>({ date: today, name: '', effect: 'low_nonveg', note: '' });
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [suggestions, setSuggestions] = useState<api.CalendarSuggestion[]>([]);
  const [lastRun, setLastRun] = useState<api.CalendarDraftRun | null>(null);
  const [justDrafted, setJustDrafted] = useState(false);
  const [busyDate, setBusyDate] = useState<string | null>(null);

  useEffect(() => {
    if (!canManage || !accessToken) return;
    let cancelled = false;
    api.getCalendarSuggestions(accessToken)
      .then((r) => { if (!cancelled) { setSuggestions(r.suggestions); setLastRun(r.lastRun); } })
      .catch(() => { /* the calendar still works without the waiting list */ });
    return () => { cancelled = true; };
  }, [accessToken, canManage]);

  const upcoming = events.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = events.filter((e) => e.date < today).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);

  const save = async (event: CalendarEvent) => {
    await api.saveCalendarDay(accessToken, event);
    onChanged();
  };

  const add = async () => {
    if (!form.name.trim()) return toast.error('Give the day a name');
    setSaving(true);
    try {
      await save({ date: form.date, name: form.name.trim(), effect: form.effect, note: form.note.trim() || undefined, confirmed: true, source: 'owner' });
      toast.success(`${form.name.trim()} added`);
      setForm({ ...form, name: '', note: '' });
    } catch (e: any) {
      toast.error(e?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (e: CalendarEvent) => {
    if (!(await confirm({ title: `Remove ${e.name}?`, body: fmtDay(e.date), confirmLabel: 'Remove day', tone: 'danger' }))) return;
    try {
      await api.deleteCalendarDay(accessToken, e.date);
      onChanged();
    } catch (err: any) {
      toast.error(err?.message || 'Could not remove');
    }
  };

  const draft = async () => {
    setDrafting(true);
    try {
      const r = await api.draftCalendar(accessToken, today, addDaysISO(today, 60));
      setSuggestions(r.suggestions);
      setLastRun({ at: new Date().toISOString(), drafted: 'manual', added: r.added });
      setJustDrafted(true);
    } catch (e: any) {
      toast.error(e?.message || 'Could not draft the calendar');
    } finally {
      setDrafting(false);
    }
  };

  const answer = async (s: api.CalendarSuggestion, add: boolean) => {
    setBusyDate(s.date);
    try {
      if (add) {
        await api.acceptCalendarSuggestion(accessToken, s.date);
        toast.success(`${s.name} added`);
        onChanged();
      } else {
        await api.dismissCalendarSuggestion(accessToken, s.date);
      }
      setSuggestions((prev) => prev.filter((x) => x.date !== s.date));
    } catch (e: any) {
      toast.error(e?.message || 'Could not save');
    } finally {
      setBusyDate(null);
    }
  };

  const field = 'w-full px-3 py-2 border border-border-strong rounded-lg text-sm bg-surface';
  const Row = ({ e }: { e: CalendarEvent }) => (
    <li className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-text">{fmtDay(e.date)} · {e.name}</p>
        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
          <span className={`text-caption px-2 py-0.5 rounded-full ${EFFECT_CHIP[e.effect]}`}>{effectLabel(e.effect)}</span>
          {e.source === 'ai' && <span className="text-caption text-text-2">AI-drafted</span>}
          {e.note && <span className="text-caption text-text-3">{e.note}</span>}
        </div>
      </div>
      {canManage && (
        <button onClick={() => remove(e)} className="p-1.5 text-text-3 hover:text-danger flex-shrink-0" aria-label={`Remove ${e.name}`}><Trash2 className="w-4 h-4" /></button>
      )}
    </li>
  );

  return (
    <div className="bg-surface rounded-lg border border-border p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-warning-soft text-warning flex items-center justify-center flex-shrink-0"><CalendarDays className="w-5 h-5" /></div>
          <div>
            <h3 className="font-bold text-text">Festival &amp; event calendar</h3>
            <p className="text-xs text-text-3">The forecast adjusts these days and learns from how they actually went</p>
          </div>
        </div>
        {canManage && (
          <button onClick={draft} disabled={drafting} className="min-h-11 px-3 py-2 rounded-md border border-border-strong bg-surface text-text hover:bg-surface-2 text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-60">
            {drafting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} {drafting ? 'Checking dates...' : 'Draft next 60 days with AI'}
          </button>
        )}
      </div>

      {canManage && (suggestions.length > 0 || justDrafted) && (
        <div className="mb-4 rounded-lg border border-border bg-surface-2 p-3">
          <p className="text-xs font-semibold text-text-2 mb-2">{suggestions.length ? 'Suggested days - check each date, then add the right ones' : 'No new days suggested for the next 60 days.'}</p>
          <ul className="space-y-2">
            {suggestions.map((s) => (
              <li key={s.date} className="flex items-start justify-between gap-2 bg-surface rounded-lg border border-border p-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text">{fmtDay(s.date)} · {s.name}</p>
                  <p className="text-caption text-text-2"><span className={`px-1.5 py-0.5 rounded-full ${EFFECT_CHIP[s.effect]}`}>{effectLabel(s.effect)}</span> {s.reason}{s.confidence !== 'high' ? ' · date not confirmed' : ''}</p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => answer(s, true)} disabled={busyDate === s.date} className="size-11 inline-flex items-center justify-center rounded-md bg-success-soft text-success border border-success-border disabled:opacity-60" aria-label={`Add ${s.name}`}><Check className="w-4 h-4" /></button>
                  <button onClick={() => answer(s, false)} disabled={busyDate === s.date} className="p-2.5 rounded-lg border border-border-strong text-text-2 disabled:opacity-60" aria-label={`Skip ${s.name}`}><X className="w-4 h-4" /></button>
                </div>
              </li>
            ))}
          </ul>
          {lastRun && (
            <p className="text-caption text-text-2 mt-2">
              Last checked {fmtDay(new Date(Date.parse(lastRun.at) + 330 * 60000).toISOString().slice(0, 10))}{lastRun.drafted === 'weekly' ? ' (weekly check)' : ''}. Skipped days won't be suggested again.
            </p>
          )}
        </div>
      )}

      {canManage && (
        <div className="grid grid-cols-1 sm:grid-cols-[9rem_1fr_11rem_auto] gap-2 mb-4 items-end">
          <label className="text-xs text-text-2">Date<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={`${field} mt-1`} /></label>
          <label className="text-xs text-text-2">Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Kali Puja" className={`${field} mt-1`} /></label>
          <label className="text-xs text-text-2">Effect on sales
            <select value={form.effect} onChange={(e) => setForm({ ...form, effect: e.target.value as DayEffect })} className={`${field} mt-1`}>
              {DAY_EFFECTS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </label>
          <button onClick={add} disabled={saving} className="min-h-11 px-3 py-2 rounded-md bg-primary text-on-primary hover:bg-primary-hover text-sm font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-60"><Plus className="w-4 h-4" /> Add</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-semibold text-text-2 mb-1">Coming up</p>
          {upcoming.length ? <ul className="divide-y divide-border">{upcoming.map((e) => <Row key={e.date} e={e} />)}</ul> : <p className="text-sm text-text-3 py-2">Nothing marked yet.</p>}
        </div>
        <div>
          <p className="text-xs font-semibold text-text-2 mb-1">Recent</p>
          {past.length ? <ul className="divide-y divide-border">{past.map((e) => <Row key={e.date} e={e} />)}</ul> : <p className="text-sm text-text-3 py-2">No past days marked.</p>}
        </div>
      </div>
    </div>
  );
}
