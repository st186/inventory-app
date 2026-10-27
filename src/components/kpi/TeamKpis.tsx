import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, ChevronDown, ChevronUp, Info, MapPinOff, Settings2, Sparkles, Users } from 'lucide-react';
import { Button } from '../ui/button';
import { Callout } from '../ui/callout';
import { Checkbox } from '../ui/checkbox';
import { EmptyState } from '../ui/empty-state';
import { ErrorState } from '../ui/error-state';
import { Field } from '../ui/field';
import { Input } from '../ui/input';
import { MoneyInput } from '../ui/money';
import { ResponsiveModal } from '../ui/responsive-modal';
import { SkeletonText } from '../ui/skeleton';
import { StatusChip } from '../ui/status-chip';
import { Switch } from '../ui/switch';
import { confirm } from '../ui/confirm';
import { toast } from '../ui/sonner';
import { cn } from '../ui/utils';
import { InitialsAvatar } from '../ui/avatar';
import { TeamPage } from '../team/shared';
import { teamKpiApi } from '../team/teamApi';
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
  const [howOpen, setHowOpen] = useState(false);
  const [settingsFor, setSettingsFor] = useState<kpi.TeamPerson | null>(null);

  const load = useCallback(async (m: string) => {
    setLoading(true);
    setError(null);
    try {
      setData(await teamKpiApi.getTeamKpis(m));
    } catch (e) {
      setError((e as Error)?.message || 'Could not load team KPIs');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load(month);
  }, [month, load]);

  const patchPerson = (employeeId: string, patch: Partial<kpi.TeamPerson>) =>
    setData((d) => (d ? { ...d, people: d.people.map((p) => (p.employeeId === employeeId ? { ...p, ...patch } : p)) } : d));

  return (
    <TeamPage data-ai-private>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthPicker month={month} onChange={setMonth} />
        <Button variant="link" size="sm" leadingIcon={<Info />} onClick={() => setHowOpen(true)}>
          How scores and pay are worked out
        </Button>
      </div>
      {data?.canEditMoney && <ConfigBar config={data.config} onSaved={(config) => setData({ ...data, config })} />}
      {loading ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-lg border border-border bg-surface p-4">
              <SkeletonText lines={5} />
            </div>
          ))}
        </div>
      ) : error ? (
        <ErrorState body={error} onRetry={() => load(month)} />
      ) : !data?.people.length ? (
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState icon={Users} title="No staff to show" body="KPIs appear for staff once they're added in Team → People." />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {!data.monthComplete && <Callout tone="info" title={`${kpi.monthName(month)} is still going`}>Scores count up to yesterday.</Callout>}
          {data.people.map((p) => (
            <PersonCard
              key={p.employeeId}
              person={p}
              month={month}
              canApprove={data.canApprove}
              onPatch={(patch) => patchPerson(p.employeeId, patch)}
              onSettings={() => setSettingsFor(p)}
            />
          ))}
        </div>
      )}

      <ResponsiveModal open={howOpen} onOpenChange={setHowOpen} title="How scores and pay are worked out">
        <ul className="flex list-disc flex-col gap-2 pl-5 text-body-sm text-text-2">
          <li>Each KPI is scored 0–100 from the month's records; the total is the weighted average of the KPIs that have data (a KPI with no data drops out and the rest are re-weighted).</li>
          <li>Attendance counts working days only (weekly offs and approved leave are left out). On time and full shift use the shift clock, from the first day anyone used it.</li>
          <li>Variable pay formula: a total under 50 gives ₹0; from 50 to 100 it rises in a straight line from ₹0 to the person's maximum (75 = half). Rounded to ₹10.</li>
          <li>"Ask AI" sends only the KPI numbers, the role and the pay maximum under an anonymous label. It may move the formula amount by at most 15%, never above the maximum. You decide the final amount.</li>
        </ul>
      </ResponsiveModal>

      <SettingsSheet
        person={settingsFor}
        canEditMoney={!!data?.canEditMoney}
        onClose={() => setSettingsFor(null)}
        onSaved={() => {
          setSettingsFor(null);
          load(month);
        }}
      />
    </TeamPage>
  );
}

function ConfigBar({ config, onSaved }: { config: kpi.TeamKpisResponse['config']; onSaved: (c: kpi.TeamKpisResponse['config']) => void }) {
  const [radius, setRadius] = useState(String(config.radiusM));
  const [saving, setSaving] = useState(false);
  const save = async (patch: { radiusM?: number; showMoneyToStaff?: boolean }) => {
    setSaving(true);
    try {
      const r = await teamKpiApi.saveKpiConfig(patch);
      onSaved(r.config);
      toast.success('Saved');
    } catch (e) {
      toast.error((e as Error)?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="At the workplace within (metres)" className="w-56">
          <Input type="number" inputMode="numeric" min={50} max={1000} value={radius} onChange={(e) => setRadius(e.target.value)} className="num" />
        </Field>
        <Button variant="secondary" disabled={saving || Number(radius) === config.radiusM} onClick={() => save({ radiusM: Number(radius) })}>
          Save distance
        </Button>
      </div>
      <label className="flex min-h-11 items-center justify-between gap-3">
        <span className="text-body-sm text-text">Show variable-pay amounts to staff in My KPIs</span>
        <Switch checked={config.showMoneyToStaff} disabled={saving} onCheckedChange={(c) => save({ showMoneyToStaff: c })} aria-label="Show variable-pay amounts to staff" />
      </label>
      <p className="text-label text-text-3">{config.punchSince ? `Shift clock in use since ${config.punchSince}` : 'Nobody has used the shift clock yet'}</p>
    </section>
  );
}

function PersonCard({
  person: p,
  month,
  canApprove,
  onPatch,
  onSettings,
}: {
  person: kpi.TeamPerson;
  month: string;
  canApprove: boolean;
  onPatch: (patch: Partial<kpi.TeamPerson>) => void;
  onSettings: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [approving, setApproving] = useState(false);
  const [amount, setAmount] = useState<number | null>(p.approval?.approved ?? p.review?.suggestedAmount ?? p.formula?.amount ?? 0);
  useEffect(() => {
    setAmount(p.approval?.approved ?? p.review?.suggestedAmount ?? p.formula?.amount ?? 0);
  }, [p.approval?.approved, p.review?.suggestedAmount, p.formula?.amount]);
  const s = p.settings;

  const ask = async (refresh: boolean) => {
    setAsking(true);
    try {
      const r = await teamKpiApi.askKpiReview(month, p.employeeId, refresh);
      onPatch({ review: r.review });
    } catch (e) {
      toast.error((e as Error)?.message || 'The AI could not review this');
    } finally {
      setAsking(false);
    }
  };
  const approve = async () => {
    setApproving(true);
    try {
      const r = await teamKpiApi.approveVariablePay(month, p.employeeId, Number(amount));
      onPatch({ approval: r.approval });
      toast.success(`Approved ${kpi.rupees(r.approval.approved)} for ${p.name}`);
    } catch (e) {
      toast.error((e as Error)?.message || 'Could not approve');
    } finally {
      setApproving(false);
    }
  };
  const withdraw = async () => {
    const ok = await confirm({ title: `Withdraw ${p.name}'s variable pay?`, body: `${kpi.rupees(p.approval?.approved || 0)} approved for ${kpi.monthName(month)} goes back to not approved.`, confirmLabel: 'Withdraw', tone: 'danger' });
    if (!ok) return;
    try {
      await teamKpiApi.withdrawVariablePay(month, p.employeeId);
      onPatch({ approval: null });
    } catch (e) {
      toast.error((e as Error)?.message || 'Could not withdraw');
    }
  };

  const meta = [
    p.roleLabel,
    `${kpi.hhmm12(s.shiftStart)}–${kpi.hhmm12(s.shiftEnd)}`,
    `off ${s.weeklyOff.length ? s.weeklyOff.map((d) => kpi.WEEKDAYS[d]).join(', ') : 'not set'}`,
    s.hasVariablePay ? `variable pay up to ${kpi.rupees(s.variablePayMax)}` : '',
    s.isDefault ? 'default settings' : '',
  ].filter(Boolean);

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <InitialsAvatar name={p.name} />
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="truncate text-body-md font-semibold text-text">{p.name}</p>
          <p className="text-label text-text-3">{meta.join(' · ')}</p>
          {p.pinMissing && (
            <p className="mt-1 flex items-center gap-1 text-label text-warning">
              <MapPinOff className="size-4 shrink-0" aria-hidden="true" /> Workplace not pinned on the map, so check-ins can't be verified (Riders → Map pins).
            </p>
          )}
        </div>
        <TotalBadge total={p.kpis.total} />
      </div>

      <KpiBars kpis={p.kpis.kpis} compact={!open} />
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" leadingIcon={open ? <ChevronUp /> : <ChevronDown />} onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide the numbers' : 'Show the numbers'}
        </Button>
        <Button variant="ghost" size="sm" leadingIcon={<Settings2 />} onClick={onSettings}>
          Settings
        </Button>
      </div>
      {open && p.kpis.notes.length > 0 && (
        <ul className="flex list-disc flex-col gap-0.5 pl-4 text-label text-text-3">
          {p.kpis.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <FlagList flags={p.kpis.flags} />

      {s.hasVariablePay && p.formula && (
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          <p className="text-body-sm text-text-2">
            Formula: <b className="num font-semibold text-text">{kpi.rupees(p.formula.amount)}</b> <span className="text-label text-text-3">({p.formula.explanation})</span>
          </p>
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2 p-3">
            {p.review ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-body-sm text-text">
                    <Sparkles className="size-4 text-text-2" aria-hidden="true" /> AI suggests <b className="num font-semibold">{kpi.rupees(p.review.suggestedAmount)}</b>
                  </p>
                  <Button variant="link" size="sm" disabled={asking} onClick={() => ask(true)}>
                    {asking ? 'Asking…' : 'Ask again'}
                  </Button>
                </div>
                <p className="text-body-sm text-text">{p.review.oneLineSummary}</p>
                <p className="text-label text-text-2">
                  Why: {p.review.adjustmentReason}
                  {p.review.keptWithinLimits ? ` (kept within ${kpi.rupees(p.review.allowedRange[0])}–${kpi.rupees(p.review.allowedRange[1])})` : ''}
                </p>
                {Math.round(p.review.total) !== Math.round(p.kpis.total ?? -1) && <p className="text-label text-warning">Scores have changed since this review (total was {p.review.total}).</p>}
                <div className="grid gap-2 sm:grid-cols-3">
                  <ReviewList title="Strengths" items={p.review.strengths} />
                  <ReviewList title="Concerns" items={p.review.concerns} />
                  <ReviewList title="Next month" items={p.review.whatToImproveNextMonth} />
                </div>
              </>
            ) : (
              <Button variant="secondary" leadingIcon={<Sparkles />} loading={asking} disabled={p.kpis.total === null} onClick={() => ask(false)} className="self-start">
                Ask AI
              </Button>
            )}
          </div>
          {canApprove ? (
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Final amount" className="w-40">
                <MoneyInput value={amount} onValueChange={(n) => setAmount(n)} decimals={0} max={s.variablePayMax} />
              </Field>
              <Button variant="secondary" leadingIcon={<BadgeCheck />} loading={approving} disabled={amount === null} onClick={approve}>
                {p.approval ? 'Update approval' : 'Approve'}
              </Button>
              {p.approval && (
                <span className="flex items-center gap-2">
                  <StatusChip tone="success" icon={BadgeCheck}>
                    Approved {kpi.rupees(p.approval.approved)} by {p.approval.approvedBy}
                  </StatusChip>
                  <Button variant="link" size="sm" onClick={withdraw}>
                    Withdraw
                  </Button>
                </span>
              )}
            </div>
          ) : p.approval ? (
            <StatusChip tone="success" icon={BadgeCheck}>
              Approved {kpi.rupees(p.approval.approved)} by {p.approval.approvedBy}
            </StatusChip>
          ) : (
            <p className="text-label text-text-3">The owner approves the final amount.</p>
          )}
        </div>
      )}
    </section>
  );
}

function ReviewList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-label font-semibold text-text">{title}</p>
      <ul className="flex list-disc flex-col gap-0.5 pl-4 text-label text-text-2">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

function SettingsSheet({ person, canEditMoney, onClose, onSaved }: { person: kpi.TeamPerson | null; canEditMoney: boolean; onClose: () => void; onSaved: () => void }) {
  if (!person) return null;
  return <SettingsEditor key={person.employeeId} person={person} canEditMoney={canEditMoney} onClose={onClose} onSaved={onSaved} />;
}

function SettingsEditor({ person: p, canEditMoney, onClose, onSaved }: { person: kpi.TeamPerson; canEditMoney: boolean; onClose: () => void; onSaved: () => void }) {
  const s = p.settings;
  const [open, setOpen] = useState(true);
  const [shiftStart, setShiftStart] = useState(s.shiftStart);
  const [shiftEnd, setShiftEnd] = useState(s.shiftEnd);
  const [weeklyOff, setWeeklyOff] = useState<number[]>(s.weeklyOff);
  const [graceMin, setGraceMin] = useState(String(s.graceMin));
  const [hasVariablePay, setHasVariablePay] = useState(s.hasVariablePay);
  const [variablePayMax, setVariablePayMax] = useState<number | null>(s.variablePayMax || null);
  const [weights, setWeights] = useState<Record<string, string>>(Object.fromEntries(Object.entries(s.weights).map(([k, v]) => [k, String(v)])));
  const [saving, setSaving] = useState(false);
  const labels = Object.fromEntries(p.kpis.kpis.map((k) => [k.id, k.label]));
  const weightSum = Object.values(weights).reduce((a, b) => a + (Number(b) || 0), 0);

  const save = async () => {
    setSaving(true);
    try {
      await teamKpiApi.saveKpiSettings(p.employeeId, {
        shiftStart,
        shiftEnd,
        weeklyOff,
        graceMin: Number(graceMin),
        weights: Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, Number(v) || 0])) as kpi.KpiSettings['weights'],
        ...(canEditMoney ? { hasVariablePay, variablePayMax: Number(variablePayMax) || 0 } : {}),
      });
      toast.success('Settings saved');
      onSaved();
    } catch (e) {
      toast.error((e as Error)?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(o) => !o && setOpen(false)}
      onClosed={onClose}
      title="KPI settings"
      description={p.name}
      footer={
        <Button size="lg" className="flex-1" loading={saving} onClick={save}>
          Save settings
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Shift starts">
            <Input type="time" value={shiftStart} onChange={(e) => setShiftStart(e.target.value)} className="num" />
          </Field>
          <Field label="Shift ends">
            <Input type="time" value={shiftEnd} onChange={(e) => setShiftEnd(e.target.value)} className="num" />
          </Field>
        </div>
        <Field label="Grace (minutes)" className="w-40">
          <Input type="number" inputMode="numeric" min={0} max={60} value={graceMin} onChange={(e) => setGraceMin(e.target.value)} className="num" />
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-body-sm font-medium text-text">Weekly off</legend>
          <div className="flex flex-wrap gap-2">
            {kpi.WEEKDAYS.map((d, i) => {
              const on = weeklyOff.includes(i);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setWeeklyOff((w) => (on ? w.filter((x) => x !== i) : [...w, i].sort()))}
                  className={cn(
                    'hit-44 inline-flex h-9 min-w-12 items-center justify-center rounded-full border px-3 text-label font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    on ? 'border-primary bg-primary-soft font-semibold text-primary' : 'border-border-strong bg-surface text-text',
                  )}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </fieldset>
        {canEditMoney && (
          <div className="flex flex-col gap-3">
            <label className="flex min-h-11 items-center gap-3">
              <Checkbox checked={hasVariablePay} onCheckedChange={(c) => setHasVariablePay(c === true)} aria-label="Has variable pay" />
              <span className="text-body-sm text-text">Has variable pay</span>
            </label>
            {hasVariablePay && (
              <Field label="Monthly maximum">
                <MoneyInput value={variablePayMax} onValueChange={(n) => setVariablePayMax(n)} decimals={0} />
              </Field>
            )}
          </div>
        )}
        <div className="flex flex-col gap-2">
          <p className="text-body-sm font-medium text-text">
            KPI weights <span className={cn('num font-normal', weightSum === 100 ? 'text-text-3' : 'text-warning')}>· total {weightSum}{weightSum === 100 ? '' : ' (re-scaled, but 100 is easiest to read)'}</span>
          </p>
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
            {Object.keys(weights).map((id) => (
              <label key={id} className="flex min-h-12 items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-1.5">
                <span className="text-label text-text">{labels[id] || id}</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  value={weights[id]}
                  onChange={(e) => setWeights({ ...weights, [id]: e.target.value })}
                  aria-label={`${labels[id] || id} weight`}
                  className="num h-11 w-20 text-right"
                />
              </label>
            ))}
          </div>
        </div>
      </div>
    </ResponsiveModal>
  );
}
