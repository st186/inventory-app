import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, ChevronDown, ChevronUp, Loader2, MapPinOff, Settings2, Sparkles, Users } from 'lucide-react';
import { toast } from 'sonner';
import * as kpi from './kpiApi';
import { FlagList, KpiBars, MonthPicker, TotalBadge } from './KpiParts';

// "Team KPIs & variable pay" (owner and operations managers). One card per person for the chosen
// month: KPI bars with the numbers behind them, the formula amount, the AI's suggestion and
// reasons (cached on the server, so reopening doesn't run the AI again), an editable final amount
// and Approve (owner only). People with variable pay come first. The whole screen is private:
// its page id is in PRIVATE_PAGES and it is marked data-ai-private, so the Bunny chat never sends
// anyone's performance to the AI.

export function TeamKpis() {
  const [month, setMonth] = useState(kpi.istMonth());
  const [data, setData] = useState<kpi.TeamKpisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (m: string) => {
    setLoading(true);
    setError(null);
    try { setData(await kpi.getTeamKpis(m)); } catch (e: any) { setError(e?.message || 'Could not load team KPIs'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(month); }, [month, load]);

  const patchPerson = (employeeId: string, patch: Partial<kpi.TeamPerson>) =>
    setData((d) => (d ? { ...d, people: d.people.map((p) => (p.employeeId === employeeId ? { ...p, ...patch } : p)) } : d));

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6" data-ai-private>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Users className="w-6 h-6 text-orange-600" /> Team KPIs &amp; variable pay</h1>
        <MonthPicker month={month} onChange={setMonth} />
      </div>
      <details className="bg-white border border-gray-200 rounded-2xl p-4 mb-4 text-sm text-gray-700">
        <summary className="font-semibold text-gray-900 cursor-pointer">How the scores and pay are worked out</summary>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li>Each KPI is scored 0-100 from the month's records; the total is the weighted average of the KPIs that have data (a KPI with no data drops out and the rest are re-weighted).</li>
          <li>Attendance counts working days only (weekly offs and approved leave are left out). On time / full shift use the shift clock, from the first day anyone used it.</li>
          <li>Variable pay formula: a total under 50 gives ₹0; from 50 to 100 it rises in a straight line from ₹0 to the person's maximum (75 = half). Rounded to ₹10.</li>
          <li>"Ask AI" sends only the KPI numbers, the role and the pay maximum under an anonymous label. It may move the formula amount by at most 15%, never above the maximum. You decide the final amount.</li>
        </ul>
      </details>
      {data?.canEditMoney && <ConfigBar config={data.config} onSaved={(config) => setData({ ...data, config })} />}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-orange-600" /></div>
      ) : error ? (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-4">{error}</p>
      ) : !data?.people.length ? (
        <p className="text-sm text-gray-500">No staff to show.</p>
      ) : (
        <div className="space-y-4">
          {!data.monthComplete && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">{kpi.monthName(month)} is still in progress - scores count up to yesterday.</p>}
          {data.people.map((p) => (
            <PersonCard key={p.employeeId} person={p} month={month} canEditMoney={data.canEditMoney} canApprove={data.canApprove} onPatch={(patch) => patchPerson(p.employeeId, patch)} onReload={() => load(month)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ConfigBar({ config, onSaved }: { config: kpi.TeamKpisResponse['config']; onSaved: (c: kpi.TeamKpisResponse['config']) => void }) {
  const [radius, setRadius] = useState(String(config.radiusM));
  const [saving, setSaving] = useState(false);
  const save = async (patch: { radiusM?: number; showMoneyToStaff?: boolean }) => {
    setSaving(true);
    try { const r = await kpi.saveKpiConfig(patch); onSaved(r.config); toast.success('Saved'); } catch (e: any) { toast.error(e?.message || 'Could not save'); } finally { setSaving(false); }
  };
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4 flex flex-wrap items-center gap-4 text-sm">
      <label className="flex items-center gap-2">At the workplace within
        <input type="number" min={50} max={1000} value={radius} onChange={(e) => setRadius(e.target.value)} className="w-20 px-2 py-1 border border-gray-300 rounded-lg" /> m
        <button disabled={saving || Number(radius) === config.radiusM} onClick={() => save({ radiusM: Number(radius) })} className="px-2.5 py-1 rounded-lg bg-gray-900 text-white text-xs disabled:opacity-40">Save</button>
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={config.showMoneyToStaff} disabled={saving} onChange={(e) => save({ showMoneyToStaff: e.target.checked })} />
        Show variable-pay amounts to staff in My KPIs
      </label>
      <span className="text-xs text-gray-500">{config.punchSince ? `Shift clock in use since ${config.punchSince}` : 'Nobody has used the shift clock yet'}</span>
    </div>
  );
}

function PersonCard({ person: p, month, canEditMoney, canApprove, onPatch, onReload }: {
  person: kpi.TeamPerson; month: string; canEditMoney: boolean; canApprove: boolean;
  onPatch: (patch: Partial<kpi.TeamPerson>) => void; onReload: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [asking, setAsking] = useState(false);
  const [approving, setApproving] = useState(false);
  const suggested = p.approval?.approved ?? p.review?.suggestedAmount ?? p.formula?.amount ?? 0;
  const [amount, setAmount] = useState(String(suggested));
  useEffect(() => { setAmount(String(p.approval?.approved ?? p.review?.suggestedAmount ?? p.formula?.amount ?? 0)); }, [p.approval?.approved, p.review?.suggestedAmount, p.formula?.amount]);
  const s = p.settings;

  const ask = async (refresh: boolean) => {
    setAsking(true);
    try { const r = await kpi.askKpiReview(month, p.employeeId, refresh); onPatch({ review: r.review }); } catch (e: any) { toast.error(e?.message || 'The AI could not review this'); } finally { setAsking(false); }
  };
  const approve = async () => {
    setApproving(true);
    try { const r = await kpi.approveVariablePay(month, p.employeeId, Number(amount)); onPatch({ approval: r.approval }); toast.success(`Approved ${kpi.rupees(r.approval.approved)} for ${p.name}`); } catch (e: any) { toast.error(e?.message || 'Could not approve'); } finally { setApproving(false); }
  };
  const withdraw = async () => {
    if (!confirm(`Withdraw the approved variable pay for ${p.name}?`)) return;
    try { await kpi.withdrawVariablePay(month, p.employeeId); onPatch({ approval: null }); } catch (e: any) { toast.error(e?.message || 'Could not withdraw'); }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 truncate">{p.name}</p>
          <p className="text-xs text-gray-500">
            {p.roleLabel} · {kpi.hhmm12(s.shiftStart)}-{kpi.hhmm12(s.shiftEnd)} · off {s.weeklyOff.length ? s.weeklyOff.map((d) => kpi.WEEKDAYS[d]).join(', ') : 'not set'}
            {s.hasVariablePay ? ` · variable pay up to ${kpi.rupees(s.variablePayMax)}` : ''}{s.isDefault ? ' · default settings' : ''}
          </p>
          {p.pinMissing && <p className="text-xs text-amber-700 flex items-center gap-1 mt-0.5"><MapPinOff className="w-3 h-3" /> Workplace not pinned on the map - check-ins can't be verified (Riders → Map pins).</p>}
        </div>
        <TotalBadge total={p.kpis.total} />
      </div>

      <div className="mt-3"><KpiBars kpis={p.kpis.kpis} compact={!open} /></div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button onClick={() => setOpen((o) => !o)} className="text-xs font-semibold text-gray-600 flex items-center gap-1">{open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}{open ? 'Hide the numbers' : 'Show the numbers'}</button>
        <button onClick={() => setEditing((e) => !e)} className="text-xs font-semibold text-orange-700 flex items-center gap-1"><Settings2 className="w-3.5 h-3.5" /> Settings</button>
      </div>
      {open && p.kpis.notes.length > 0 && <ul className="mt-2 text-xs text-gray-500 list-disc pl-4">{p.kpis.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
      <div className="mt-2"><FlagList flags={p.kpis.flags} /></div>
      {editing && <SettingsEditor person={p} canEditMoney={canEditMoney} onSaved={() => { setEditing(false); onReload(); }} />}

      {s.hasVariablePay && p.formula && (
        <div className="mt-4 border-t border-gray-100 pt-3 space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-gray-700">Formula: <b className="tabular-nums">{kpi.rupees(p.formula.amount)}</b> <span className="text-xs text-gray-500">({p.formula.explanation})</span></p>
          </div>
          <div className="rounded-xl bg-violet-50 border border-violet-200 p-3">
            {p.review ? (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm text-violet-900 flex items-center gap-1.5"><Sparkles className="w-4 h-4" /> AI suggests <b className="tabular-nums">{kpi.rupees(p.review.suggestedAmount)}</b></p>
                  <button disabled={asking} onClick={() => ask(true)} className="text-xs text-violet-700 underline disabled:opacity-50">{asking ? 'Asking...' : 'Ask again'}</button>
                </div>
                <p className="text-sm text-gray-800 mt-1">{p.review.oneLineSummary}</p>
                <p className="text-xs text-gray-600 mt-1">Why: {p.review.adjustmentReason}{p.review.keptWithinLimits ? ` (kept within ${kpi.rupees(p.review.allowedRange[0])}-${kpi.rupees(p.review.allowedRange[1])})` : ''}</p>
                {Math.round(p.review.total) !== Math.round(p.kpis.total ?? -1) && <p className="text-xs text-amber-700 mt-1">Scores have changed since this review (total was {p.review.total}).</p>}
                <div className="grid sm:grid-cols-3 gap-2 mt-2 text-xs">
                  <ReviewList title="Strengths" items={p.review.strengths} />
                  <ReviewList title="Concerns" items={p.review.concerns} />
                  <ReviewList title="Next month" items={p.review.whatToImproveNextMonth} />
                </div>
              </>
            ) : (
              <button disabled={asking || p.kpis.total === null} onClick={() => ask(false)} className="px-3 py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5">
                {asking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Ask AI
              </button>
            )}
          </div>
          {canApprove ? (
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm text-gray-700">Final amount ₹</label>
              <input type="number" min={0} max={s.variablePayMax} value={amount} onChange={(e) => setAmount(e.target.value)} className="w-28 px-2 py-1.5 border border-gray-300 rounded-lg tabular-nums" />
              <button disabled={approving || amount === ''} onClick={approve} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5">
                {approving ? <Loader2 className="w-4 h-4 animate-spin" /> : <BadgeCheck className="w-4 h-4" />} {p.approval ? 'Update approval' : 'Approve'}
              </button>
              {p.approval && (
                <span className="text-xs text-emerald-700">Approved {kpi.rupees(p.approval.approved)} by {p.approval.approvedBy} · <button onClick={withdraw} className="underline text-gray-500">withdraw</button></span>
              )}
            </div>
          ) : p.approval ? (
            <p className="text-xs text-emerald-700">Approved {kpi.rupees(p.approval.approved)} by {p.approval.approvedBy}</p>
          ) : (
            <p className="text-xs text-gray-500">The owner approves the final amount.</p>
          )}
        </div>
      )}
    </div>
  );
}

function ReviewList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="font-semibold text-gray-800">{title}</p>
      <ul className="list-disc pl-4 text-gray-700 space-y-0.5">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
    </div>
  );
}

function SettingsEditor({ person: p, canEditMoney, onSaved }: { person: kpi.TeamPerson; canEditMoney: boolean; onSaved: () => void }) {
  const s = p.settings;
  const [shiftStart, setShiftStart] = useState(s.shiftStart);
  const [shiftEnd, setShiftEnd] = useState(s.shiftEnd);
  const [weeklyOff, setWeeklyOff] = useState<number[]>(s.weeklyOff);
  const [graceMin, setGraceMin] = useState(String(s.graceMin));
  const [hasVariablePay, setHasVariablePay] = useState(s.hasVariablePay);
  const [variablePayMax, setVariablePayMax] = useState(String(s.variablePayMax || ''));
  const [weights, setWeights] = useState<Record<string, string>>(Object.fromEntries(Object.entries(s.weights).map(([k, v]) => [k, String(v)])));
  const [saving, setSaving] = useState(false);
  const labels = Object.fromEntries(p.kpis.kpis.map((k) => [k.id, k.label]));
  const weightSum = Object.values(weights).reduce((a, b) => a + (Number(b) || 0), 0);

  const save = async () => {
    setSaving(true);
    try {
      await kpi.saveKpiSettings(p.employeeId, {
        shiftStart, shiftEnd, weeklyOff, graceMin: Number(graceMin),
        weights: Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, Number(v) || 0])) as any,
        ...(canEditMoney ? { hasVariablePay, variablePayMax: Number(variablePayMax) || 0 } : {}),
      });
      toast.success('Settings saved');
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50/50 p-3 space-y-3 text-sm">
      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-1.5">Shift <input type="time" value={shiftStart} onChange={(e) => setShiftStart(e.target.value)} className="px-2 py-1 border border-gray-300 rounded-lg bg-white" /></label>
        <label className="flex items-center gap-1.5">to <input type="time" value={shiftEnd} onChange={(e) => setShiftEnd(e.target.value)} className="px-2 py-1 border border-gray-300 rounded-lg bg-white" /></label>
        <label className="flex items-center gap-1.5">Grace <input type="number" min={0} max={60} value={graceMin} onChange={(e) => setGraceMin(e.target.value)} className="w-16 px-2 py-1 border border-gray-300 rounded-lg bg-white" /> min</label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span>Weekly off:</span>
        {kpi.WEEKDAYS.map((d, i) => (
          <label key={d} className={`px-2 py-1 rounded-lg border cursor-pointer ${weeklyOff.includes(i) ? 'bg-orange-600 text-white border-orange-600' : 'bg-white border-gray-300'}`}>
            <input type="checkbox" className="sr-only" checked={weeklyOff.includes(i)} onChange={(e) => setWeeklyOff((w) => (e.target.checked ? [...w, i].sort() : w.filter((x) => x !== i)))} />{d}
          </label>
        ))}
      </div>
      {canEditMoney && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={hasVariablePay} onChange={(e) => setHasVariablePay(e.target.checked)} /> Has variable pay</label>
          {hasVariablePay && <label className="flex items-center gap-1.5">Monthly maximum ₹ <input type="number" min={0} value={variablePayMax} onChange={(e) => setVariablePayMax(e.target.value)} className="w-28 px-2 py-1 border border-gray-300 rounded-lg bg-white" /></label>}
        </div>
      )}
      <div>
        <p className="mb-1">KPI weights <span className={`text-xs ${weightSum === 100 ? 'text-gray-500' : 'text-amber-700'}`}>(total {weightSum}{weightSum === 100 ? '' : ' - they are re-scaled, but 100 is easiest to read'})</span></p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {Object.keys(weights).map((id) => (
            <label key={id} className="flex items-center justify-between gap-2 bg-white border border-gray-200 rounded-lg px-2 py-1">
              <span className="text-xs text-gray-700">{labels[id] || id}</span>
              <input type="number" min={0} max={100} value={weights[id]} onChange={(e) => setWeights({ ...weights, [id]: e.target.value })} className="w-14 px-1 py-0.5 border border-gray-300 rounded text-right" />
            </label>
          ))}
        </div>
      </div>
      <button disabled={saving} onClick={save} className="px-3 py-2 rounded-lg bg-gray-900 text-white font-semibold disabled:opacity-50 flex items-center gap-1.5">
        {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save settings
      </button>
    </div>
  );
}
