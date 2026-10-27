import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Cloud, HardDrive, Loader2, Plus, Save, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { getTemplate, saveSettings, saveTemplate, type Person, type TemplateItem, type WorkplaceAccess, type WorkplaceSettings } from './workplaceApi';
import { DAY_LETTERS, DAY_NAMES } from './workplaceUtils';

type Props = { access: WorkplaceAccess; onSettings: (s: WorkplaceSettings) => void };

const locKey = (l: { kind: string; id: string }) => `${l.kind}:${l.id}`;
const newItem = (): TemplateItem => ({ id: '', name: '', nameBn: '', hint: '', assigneeId: null, start: '15:00', end: '16:00', days: [0, 1, 2, 3, 4, 5, 6] });

// Checklist setup (owner and operations managers): for each store and production house, the areas
// to photograph, who does each, the daily time window (IST) and the days. A place without a saved
// list starts from the suggested one; nothing is due from anyone until people are picked and saved.
export function WorkplaceSetup({ access, onSettings }: Props) {
  const [loc, setLoc] = useState(access.locations[0] ? locKey(access.locations[0]) : '');
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [isDefault, setIsDefault] = useState(false);
  const [updated, setUpdated] = useState<{ at?: string; by?: string }>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [bulk, setBulk] = useState({ assigneeId: '', start: '15:00', end: '16:00' });
  const [threshold, setThreshold] = useState(access.settings.aiThreshold);

  const place = access.locations.find((l) => locKey(l) === loc) || null;

  useEffect(() => {
    if (!place) return;
    let cancelled = false;
    setLoading(true);
    getTemplate(place.kind, place.id)
      .then((r) => {
        if (cancelled) return;
        setItems(r.template.items.map((i) => ({ ...i, hint: i.hint || '' })));
        setPeople(r.people || []);
        setIsDefault(r.isDefault);
        setUpdated({ at: r.template.updatedAt, by: r.template.updatedBy });
        setDirty(false);
      })
      .catch((e) => toast.error(e?.message || 'Could not load the checklist'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc]);

  const edit = (i: number, patch: Partial<TemplateItem>) => { setItems((list) => list.map((x, j) => (j === i ? { ...x, ...patch } : x))); setDirty(true); };
  const move = (i: number, by: number) => {
    setItems((list) => { const next = [...list]; const [x] = next.splice(i, 1); next.splice(Math.max(0, Math.min(next.length, i + by)), 0, x); return next; });
    setDirty(true);
  };
  const remove = (i: number) => { setItems((list) => list.filter((_, j) => j !== i)); setDirty(true); };
  const toggleDay = (i: number, d: number) => {
    const days = items[i].days.includes(d) ? items[i].days.filter((x) => x !== d) : [...items[i].days, d].sort();
    edit(i, { days });
  };
  const applyAll = () => {
    if (bulk.start >= bulk.end) return toast.error('The time must end after it starts');
    setItems((list) => list.map((x) => ({ ...x, start: bulk.start, end: bulk.end, ...(bulk.assigneeId ? { assigneeId: bulk.assigneeId } : {}) })));
    setDirty(true);
  };

  const switchPlace = (v: string) => {
    if (dirty && !window.confirm('Leave without saving the changes to this checklist?')) return;
    setLoc(v);
  };

  const save = async () => {
    if (!place) return;
    for (const it of items) {
      if (!it.name.trim()) return toast.error('Every check needs an English name');
      if (it.start >= it.end) return toast.error(`${it.name}: the time must end after it starts`);
      if (!it.days.length) return toast.error(`${it.name}: pick at least one day`);
    }
    setSaving(true);
    try {
      const r = await saveTemplate(place.kind, place.id, items.map((i) => ({ ...i, hint: i.hint?.trim() || undefined })));
      setItems(r.template.items.map((i) => ({ ...i, hint: i.hint || '' })));
      setIsDefault(false);
      setUpdated({ at: r.template.updatedAt, by: r.template.updatedBy });
      setDirty(false);
      const unassigned = r.template.items.filter((i) => !i.assigneeId).length;
      toast.success(unassigned ? `Saved - ${unassigned} check${unassigned === 1 ? '' : 's'} still without a person` : 'Saved');
    } catch (e: any) {
      toast.error(e?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const saveAi = async (patch: Partial<WorkplaceSettings>) => {
    try {
      const r = await saveSettings(patch);
      onSettings(r.settings);
      setThreshold(r.settings.aiThreshold);
      toast.success('AI check settings saved');
    } catch (e: any) {
      toast.error(e?.message || 'Could not save');
    }
  };

  const field = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-base bg-white';
  const here = people.filter((p) => p.here);
  const others = people.filter((p) => !p.here);
  const PersonOptions = () => (
    <>
      {here.length > 0 && <optgroup label="Works here">{here.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>}
      {others.length > 0 && <optgroup label="Other staff">{others.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>}
    </>
  );

  if (!access.locations.length) return <p className="text-gray-600">No stores or production houses yet.</p>;

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-gray-200 bg-white p-3 space-y-3">
        <p className="font-semibold text-gray-900 inline-flex items-center gap-1"><Sparkles className="w-4 h-4 text-orange-500" /> AI hygiene check</p>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Score every photo for cleanliness (about ₹0.02 a photo, counted in the monthly AI limit)</span>
          <input type="checkbox" checked={access.settings.aiEnabled} onChange={(e) => saveAi({ aiEnabled: e.target.checked })} className="w-5 h-5 accent-orange-600 flex-shrink-0" />
        </label>
        <div className="flex items-center gap-2 text-sm">
          <span className="flex-1">Mark "needs cleaning" and notify when the score is below</span>
          <input type="number" min={1} max={10} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="w-16 px-2 py-1.5 border border-gray-300 rounded-lg text-base" />
          <button onClick={() => saveAi({ aiThreshold: threshold })} disabled={threshold === access.settings.aiThreshold} className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-sm disabled:opacity-40">Save</button>
        </div>
        {access.aiConfigured === false && <p className="text-xs text-amber-700">The AI key isn't set up yet, so photos are saved without a score.</p>}
        <p className="text-xs text-gray-600 inline-flex items-center gap-1">
          {access.storage === 'drive'
            ? <><Cloud className="w-3.5 h-3.5" /> Photos are saved to your Google Drive (Workplace photos folder) and kept.</>
            : <><HardDrive className="w-3.5 h-3.5" /> Photos are saved in the app's storage for 60 days. Connect Google Drive to keep them.</>}
        </p>
      </section>

      <select value={loc} onChange={(e) => switchPlace(e.target.value)} className={field} aria-label="Place">
        {access.locations.map((l) => <option key={locKey(l)} value={locKey(l)}>{l.name}{l.kind === 'production' ? ' (production)' : ''}</option>)}
      </select>

      {loading ? (
        <div className="py-12 flex justify-center text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : (
        <>
          {isDefault ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Suggested list for this place. Pick a person for each check and press <b>Save</b> - nobody is asked for photos until then.
            </div>
          ) : updated.at ? (
            <p className="text-xs text-gray-500">Last saved {new Date(updated.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}{updated.by ? ` by ${updated.by}` : ''}.</p>
          ) : null}

          <section className="rounded-xl border border-gray-200 bg-white p-3 space-y-2" data-ai-private>
            <p className="text-sm font-semibold text-gray-900">Set for all checks</p>
            <select value={bulk.assigneeId} onChange={(e) => setBulk({ ...bulk, assigneeId: e.target.value })} className={field} aria-label="Person for all">
              <option value="">Keep each check's person</option>
              <PersonOptions />
            </select>
            <div className="flex items-center gap-2">
              <input type="time" value={bulk.start} onChange={(e) => setBulk({ ...bulk, start: e.target.value })} className={field} aria-label="Start for all" />
              <span className="text-gray-500">to</span>
              <input type="time" value={bulk.end} onChange={(e) => setBulk({ ...bulk, end: e.target.value })} className={field} aria-label="End for all" />
              <button onClick={applyAll} className="px-3 py-2 rounded-lg bg-gray-900 text-white text-sm flex-shrink-0">Apply</button>
            </div>
          </section>

          <ul className="space-y-3" data-ai-private>
            {items.map((it, i) => (
              <li key={it.id || `new-${i}`} className={`rounded-xl border bg-white p-3 space-y-2 ${it.assigneeId ? 'border-gray-200' : 'border-amber-300'}`}>
                <div className="grid grid-cols-2 gap-2">
                  <input value={it.name} onChange={(e) => edit(i, { name: e.target.value })} maxLength={60} placeholder="Name (English)" className={field} aria-label="English name" />
                  <input value={it.nameBn} onChange={(e) => edit(i, { nameBn: e.target.value })} maxLength={60} placeholder="নাম (বাংলা)" className={field} aria-label="Bengali name" />
                </div>
                <input value={it.hint || ''} onChange={(e) => edit(i, { hint: e.target.value })} maxLength={160} placeholder="What to show / check (optional) - the AI reads this too" className={field} aria-label="Hint" />
                <select value={it.assigneeId || ''} onChange={(e) => edit(i, { assigneeId: e.target.value || null })} className={field} aria-label="Person">
                  <option value="">Not assigned yet</option>
                  <PersonOptions />
                </select>
                <div className="flex items-center gap-2">
                  <input type="time" value={it.start} onChange={(e) => edit(i, { start: e.target.value })} className={field} aria-label="Start" />
                  <span className="text-gray-500">to</span>
                  <input type="time" value={it.end} onChange={(e) => edit(i, { end: e.target.value })} className={field} aria-label="End" />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex gap-1">
                    {DAY_LETTERS.map((d, k) => (
                      <button key={k} type="button" onClick={() => toggleDay(i, k)} title={DAY_NAMES[k]} aria-pressed={it.days.includes(k)}
                        className={`w-8 h-8 rounded-full text-xs font-semibold ${it.days.includes(k) ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-500'}`}>{d}</button>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => move(i, -1)} disabled={i === 0} className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-30" aria-label="Move up"><ArrowUp className="w-4 h-4" /></button>
                    <button onClick={() => move(i, 1)} disabled={i === items.length - 1} className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-30" aria-label="Move down"><ArrowDown className="w-4 h-4" /></button>
                    <button onClick={() => remove(i)} className="p-1.5 rounded-lg border border-red-200 text-red-600" aria-label="Remove"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <button onClick={() => { setItems((l) => [...l, newItem()]); setDirty(true); }} className="w-full py-2.5 rounded-xl border-2 border-dashed border-gray-300 text-gray-700 text-sm font-semibold inline-flex items-center justify-center gap-1">
            <Plus className="w-4 h-4" /> Add a check
          </button>

          <div className="sticky bottom-3">
            <button onClick={save} disabled={saving || (!dirty && !isDefault)} className="w-full py-3 rounded-xl bg-orange-600 text-white font-semibold shadow-lg inline-flex items-center justify-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save checklist
            </button>
          </div>
        </>
      )}
    </div>
  );
}
