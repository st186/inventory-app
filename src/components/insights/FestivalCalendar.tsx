import { useState } from 'react';
import { CalendarDays, Plus, Sparkles, Trash2, Check, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import * as api from '../../utils/api';
import { DAY_EFFECTS, addDaysISO, type CalendarEvent, type DayEffect } from '../../utils/forecast';
import { getTodayIST } from '../../utils/timezone';
import { EFFECT_CHIP, effectLabel } from './ForecastCard';
import { fmtDay } from './useInsightsOverview';

// The festival / event calendar the forecast reads. The owner side adds days by hand or
// accepts days the AI drafts (it checks lunar festival dates with a web search).
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
  const [suggestions, setSuggestions] = useState<api.CalendarSuggestion[] | null>(null);

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
    if (!window.confirm(`Remove ${e.name} on ${fmtDay(e.date)}?`)) return;
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
      setSuggestions(await api.draftCalendar(accessToken, today, addDaysISO(today, 60)));
    } catch (e: any) {
      toast.error(e?.message || 'Could not draft the calendar');
    } finally {
      setDrafting(false);
    }
  };

  const accept = async (s: api.CalendarSuggestion) => {
    try {
      await save({ date: s.date, name: s.name, effect: s.effect, note: s.reason, confirmed: true, source: 'ai' });
      setSuggestions((prev) => prev?.filter((x) => x.date !== s.date) || null);
      toast.success(`${s.name} added`);
    } catch (e: any) {
      toast.error(e?.message || 'Could not save');
    }
  };

  const field = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white';
  const Row = ({ e }: { e: CalendarEvent }) => (
    <li className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900">{fmtDay(e.date)} · {e.name}</p>
        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
          <span className={`text-[11px] px-2 py-0.5 rounded-full ${EFFECT_CHIP[e.effect]}`}>{effectLabel(e.effect)}</span>
          {e.source === 'ai' && <span className="text-[11px] text-violet-700">AI-drafted</span>}
          {e.note && <span className="text-[11px] text-gray-500">{e.note}</span>}
        </div>
      </div>
      {canManage && (
        <button onClick={() => remove(e)} className="p-1.5 text-gray-400 hover:text-red-600 flex-shrink-0" aria-label={`Remove ${e.name}`}><Trash2 className="w-4 h-4" /></button>
      )}
    </li>
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0"><CalendarDays className="w-5 h-5" /></div>
          <div>
            <h3 className="font-bold text-gray-900">Festival &amp; event calendar</h3>
            <p className="text-xs text-gray-500">The forecast adjusts these days and learns from how they actually went</p>
          </div>
        </div>
        {canManage && (
          <button onClick={draft} disabled={drafting} className="px-3 py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-60">
            {drafting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} {drafting ? 'Checking dates...' : 'Draft next 60 days with AI'}
          </button>
        )}
      </div>

      {suggestions && (
        <div className="mb-4 rounded-lg border border-violet-200 bg-violet-50/50 p-3">
          <p className="text-xs font-semibold text-violet-800 mb-2">{suggestions.length ? 'Suggested days - check each date, then add the right ones' : 'No new days suggested for the next 60 days.'}</p>
          <ul className="space-y-2">
            {suggestions.map((s) => (
              <li key={s.date} className="flex items-start justify-between gap-2 bg-white rounded-lg border border-violet-100 p-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{fmtDay(s.date)} · {s.name}</p>
                  <p className="text-[11px] text-gray-600"><span className={`px-1.5 py-0.5 rounded-full ${EFFECT_CHIP[s.effect]}`}>{effectLabel(s.effect)}</span> {s.reason}{s.confidence !== 'high' ? ' · date not confirmed' : ''}</p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => accept(s)} className="p-1.5 rounded-lg bg-emerald-600 text-white" aria-label={`Add ${s.name}`}><Check className="w-4 h-4" /></button>
                  <button onClick={() => setSuggestions((prev) => prev?.filter((x) => x.date !== s.date) || null)} className="p-1.5 rounded-lg border border-gray-300 text-gray-600" aria-label={`Skip ${s.name}`}><X className="w-4 h-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {canManage && (
        <div className="grid grid-cols-1 sm:grid-cols-[9rem_1fr_11rem_auto] gap-2 mb-4 items-end">
          <label className="text-xs text-gray-600">Date<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={`${field} mt-1`} /></label>
          <label className="text-xs text-gray-600">Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Kali Puja" className={`${field} mt-1`} /></label>
          <label className="text-xs text-gray-600">Effect on sales
            <select value={form.effect} onChange={(e) => setForm({ ...form, effect: e.target.value as DayEffect })} className={`${field} mt-1`}>
              {DAY_EFFECTS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </label>
          <button onClick={add} disabled={saving} className="px-3 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-60"><Plus className="w-4 h-4" /> Add</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-1">Coming up</p>
          {upcoming.length ? <ul className="divide-y divide-gray-100">{upcoming.map((e) => <Row key={e.date} e={e} />)}</ul> : <p className="text-sm text-gray-500 py-2">Nothing marked yet.</p>}
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-1">Recent</p>
          {past.length ? <ul className="divide-y divide-gray-100">{past.map((e) => <Row key={e.date} e={e} />)}</ul> : <p className="text-sm text-gray-500 py-2">No past days marked.</p>}
        </div>
      </div>
    </div>
  );
}
