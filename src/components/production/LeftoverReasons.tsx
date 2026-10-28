// Why stuffing was left over (owner, 28 Oct 2026), asked in the day's close when more than a
// little stuffing or coating is left. Every reason that applies is picked, each with its details:
// a power cut (from when to when), a late start (when work began, who was late - their check-in
// times are shown - why, and whether that was genuine; the server holds it against the check-ins),
// breaks that ran past the hour (each person, about how long, why, genuine; breaks aren't tracked
// otherwise), a machine breakdown (which machine, down
// from when to when, what was used instead; it raises a repair alarm for the incharge and the
// owner), fewer orders, made ahead for tomorrow, short of staff, or something else. The server
// keeps it on the day's ledger record (index.ts cleanLeftoverReport).
import { AlertTriangle, Plus, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Callout } from '../ui/callout';
import { Checkbox } from '../ui/checkbox';
import { Field } from '../ui/field';
import { IconButton } from '../ui/icon-button';
import { Input } from '../ui/input';
import { cn } from '../ui/utils';
import { useT, type I18nKey } from '../../utils/i18n';
import type { LedgerDayContext, LeftoverKind, LeftoverReport } from '../../utils/api';

type Genuine = '' | 'yes' | 'no' | 'unsure';
type BreakEntry = { minutes: string; why: string; genuine: Genuine };
const NOBODY = '_'; // the one entry when the staff list isn't available
const emptyBreak = (): BreakEntry => ({ minutes: '', why: '', genuine: '' });
const breakIds = (d: LeftoverDraft, ctx: LedgerDayContext | null) => (ctx?.staff.length ? d.longBreak.people : [NOBODY]);

export type LeftoverDraft = {
  kinds: LeftoverKind[];
  power: { from: string; to: string }[];
  late: { startedAt: string; people: string[]; why: string; genuine: '' | 'yes' | 'no' | 'unsure' };
  // Several people can go over; each ticked person has their own minutes, reason and verdict.
  longBreak: { people: string[]; byPerson: Record<string, BreakEntry> };
  machine: { machine: string; downFrom: string; downTo: string; stillDown: boolean; alternative: string; raiseRepair: boolean };
  notes: Partial<Record<LeftoverKind, string>>;
  missing: string[];
};

export const emptyLeftoverDraft = (): LeftoverDraft => ({
  kinds: [],
  power: [{ from: '', to: '' }],
  late: { startedAt: '', people: [], why: '', genuine: '' },
  longBreak: { people: [], byPerson: {} },
  machine: { machine: '', downFrom: '', downTo: '', stillDown: false, alternative: '', raiseRepair: true },
  notes: {},
  missing: [],
});

const KINDS: { kind: LeftoverKind; label: I18nKey }[] = [
  { kind: 'power_cut', label: 'stock.prod.why.power' },
  { kind: 'late_start', label: 'stock.prod.why.late' },
  { kind: 'long_break', label: 'stock.prod.why.longBreak' },
  { kind: 'machine', label: 'stock.prod.why.machine' },
  { kind: 'low_demand', label: 'stock.prod.why.lowDemand' },
  { kind: 'planned', label: 'stock.prod.why.planned' },
  { kind: 'short_staff', label: 'stock.prod.why.shortStaff' },
  { kind: 'other', label: 'stock.prod.why.other' },
];
export const leftoverKindLabel = (kind: LeftoverKind): I18nKey => KINDS.find((k) => k.kind === kind)?.label || 'stock.prod.why.other';
// Machines most kitchens have, offered alongside the ones in the equipment register.
const COMMON_MACHINES = ['Steamer', 'Mixer grinder', 'Dough kneader', 'Fridge / freezer', 'Induction', 'Weighing scale', 'Sealing machine'];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The first thing missing, in the user's language, or null when the reasons are complete. */
export function leftoverProblem(d: LeftoverDraft, t: (k: I18nKey, v?: Record<string, string | number>) => string, ctx: LedgerDayContext | null = null): string | null {
  if (!d.kinds.length) return t('stock.prod.why.errPick');
  for (const kind of d.kinds) {
    if (kind === 'power_cut' && !d.power.some((p) => TIME.test(p.from) && TIME.test(p.to) && p.from < p.to)) return t('stock.prod.why.errPower');
    if (kind === 'late_start') {
      if (d.late.why.trim().length < 3) return t('stock.prod.why.errLateWhy');
      if (!d.late.genuine) return t('stock.prod.why.errGenuine');
    }
    if (kind === 'long_break') {
      const ids = breakIds(d, ctx);
      if (!ids.length) return t('stock.prod.why.errBreakWho');
      for (const id of ids) {
        const e = d.longBreak.byPerson[id] || emptyBreak();
        const who = ctx?.staff.find((p) => p.id === id)?.name;
        if (e.why.trim().length < 3) return `${t('stock.prod.why.errBreakWhy')}${who ? ` (${who})` : ''}`;
        if (!e.genuine) return `${t('stock.prod.why.errBreakGenuine')}${who ? ` (${who})` : ''}`;
      }
    }
    if (kind === 'machine') {
      if (!d.machine.machine.trim() || !TIME.test(d.machine.downFrom)) return t('stock.prod.why.errMachine');
      if (!d.machine.stillDown && (!TIME.test(d.machine.downTo) || d.machine.downTo <= d.machine.downFrom)) return t('stock.prod.why.errMachineBack');
      if (!d.machine.alternative.trim()) return t('stock.prod.why.errAlternative');
    }
    if ((kind === 'other' || kind === 'short_staff') && (d.notes[kind] || '').trim().length < 3) return t('stock.prod.why.errNote', { reason: t(leftoverKindLabel(kind)) });
  }
  return null;
}

/** What the close-day request sends. */
export function leftoverPayload(d: LeftoverDraft, ctx: LedgerDayContext | null): LeftoverReport {
  const reasons = d.kinds.map((kind) => {
    if (kind === 'power_cut') return { kind, periods: d.power.filter((p) => TIME.test(p.from) && TIME.test(p.to)) };
    if (kind === 'late_start') return { kind, startedAt: d.late.startedAt || null, people: d.late.people, why: d.late.why.trim(), genuine: d.late.genuine };
    if (kind === 'long_break') {
      return {
        kind,
        entries: breakIds(d, ctx).map((id) => {
          const e = d.longBreak.byPerson[id] || emptyBreak();
          return { personId: id === NOBODY ? null : id, minutes: parseInt(e.minutes, 10) || null, why: e.why.trim(), genuine: e.genuine };
        }),
      };
    }
    if (kind === 'machine') {
      const asset = ctx?.machines.find((m) => m.name.trim().toLowerCase() === d.machine.machine.trim().toLowerCase());
      return { kind, assetId: asset?.id || null, ...d.machine, machine: d.machine.machine.trim(), alternative: d.machine.alternative.trim(), downTo: d.machine.stillDown ? null : d.machine.downTo };
    }
    return { kind, note: (d.notes[kind] || '').trim(), ...(kind === 'short_staff' ? { people: d.missing } : {}) };
  });
  return { reasons } as LeftoverReport;
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });

function Chip({ on, label, onClick, disabled }: { on: boolean; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'hit-44 inline-flex min-h-9 items-center justify-center rounded-full border px-3 text-label font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
        on ? 'border-primary bg-primary-soft font-semibold text-primary' : 'border-border-strong bg-surface text-text',
      )}
    >
      {label}
    </button>
  );
}

function PeoplePicker({ ctx, picked, onChange, disabled, showLate }: { ctx: LedgerDayContext | null; picked: string[]; onChange: (ids: string[]) => void; disabled?: boolean; showLate?: boolean }) {
  const { t } = useT();
  if (!ctx?.staff.length) return null;
  return (
    <div className="flex flex-col gap-1">
      {ctx.staff.map((p) => {
        const on = picked.includes(p.id);
        const meta = p.onLeave ? t('stock.prod.why.onLeave')
          : !p.checkInAt ? t('stock.prod.why.noCheckIn')
            : [t('stock.prod.why.checkedIn', { time: timeOf(p.checkInAt) }), showLate && p.lateMin > 0 ? t('stock.prod.why.lateBy', { n: p.lateMin }) : ''].filter(Boolean).join(' · ');
        return (
          <label key={p.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-1">
            <Checkbox checked={on} disabled={disabled} onCheckedChange={(c) => onChange(c === true ? [...picked, p.id] : picked.filter((x) => x !== p.id))} />
            <span className="flex min-w-0 flex-col">
              <span className="text-body-sm text-text">{p.name}</span>
              <span className={cn('num text-caption', showLate && p.lateMin > 0 ? 'text-warning' : 'text-text-3')}>{meta}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

export function LeftoverReasons({ leftoverKg, ctx, value: d, onChange, disabled }: {
  leftoverKg: number;
  ctx: LedgerDayContext | null;
  value: LeftoverDraft;
  onChange: (next: LeftoverDraft) => void;
  disabled?: boolean;
}) {
  const { t } = useT();
  const set = (patch: Partial<LeftoverDraft>) => onChange({ ...d, ...patch });
  const toggle = (kind: LeftoverKind) => {
    const on = d.kinds.includes(kind);
    const next: Partial<LeftoverDraft> = { kinds: on ? d.kinds.filter((k) => k !== kind) : [...d.kinds, kind] };
    // A late start starts with the people whose check-in was late already ticked.
    if (!on && kind === 'late_start' && !d.late.people.length && ctx) next.late = { ...d.late, people: ctx.staff.filter((p) => p.lateMin > 0).map((p) => p.id) };
    set(next);
  };
  const noteField = (kind: LeftoverKind, label: I18nKey) => (
    <Field label={t(label)} optional={kind !== 'other' && kind !== 'short_staff'}>
      <Input value={d.notes[kind] || ''} disabled={disabled} maxLength={300} onChange={(e) => set({ notes: { ...d.notes, [kind]: e.target.value } })} />
    </Field>
  );
  const machineNames = [...new Set([...(ctx?.machines || []).map((m) => m.name), ...COMMON_MACHINES])];

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning-soft/40 p-3">
      <div className="flex flex-col gap-0.5">
        <p className="num text-body-md font-semibold text-text">{t('stock.prod.why.title', { kg: Math.round(leftoverKg * 10) / 10 })}</p>
        <p className="text-label text-text-2">{t('stock.prod.why.hint')}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {KINDS.map((k) => <Chip key={k.kind} on={d.kinds.includes(k.kind)} label={t(k.label)} disabled={disabled} onClick={() => toggle(k.kind)} />)}
      </div>

      {d.kinds.includes('power_cut') && (
        <fieldset className="flex flex-col gap-2 rounded-md bg-surface p-3">
          <legend className="sr-only">{t('stock.prod.why.power')}</legend>
          <p className="text-body-sm font-semibold text-text">{t('stock.prod.why.power')}</p>
          {d.power.map((p, i) => (
            <div key={i} className="flex items-end gap-2">
              <Field label={t('stock.prod.why.powerFrom')} className="flex-1">
                <Input type="time" className="num" value={p.from} disabled={disabled} onChange={(e) => set({ power: d.power.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)) })} />
              </Field>
              <Field label={t('stock.prod.why.powerTo')} className="flex-1">
                <Input type="time" className="num" value={p.to} disabled={disabled} onChange={(e) => set({ power: d.power.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)) })} />
              </Field>
              {d.power.length > 1 && <IconButton label={t('common.delete')} icon={<X />} disabled={disabled} onClick={() => set({ power: d.power.filter((_, j) => j !== i) })} />}
            </div>
          ))}
          {d.power.length < 3 && (
            <Button variant="link" size="sm" className="self-start" leadingIcon={<Plus />} disabled={disabled} onClick={() => set({ power: [...d.power, { from: '', to: '' }] })}>{t('stock.prod.why.addCut')}</Button>
          )}
        </fieldset>
      )}

      {d.kinds.includes('late_start') && (
        <fieldset className="flex flex-col gap-3 rounded-md bg-surface p-3">
          <legend className="sr-only">{t('stock.prod.why.late')}</legend>
          <p className="text-body-sm font-semibold text-text">{t('stock.prod.why.late')}</p>
          <Field label={t('stock.prod.why.startedAt')} optional className="max-w-64">
            <Input type="time" className="num" value={d.late.startedAt} disabled={disabled} onChange={(e) => set({ late: { ...d.late, startedAt: e.target.value } })} />
          </Field>
          {ctx && ctx.staff.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-body-sm font-medium text-text">{t('stock.prod.why.whoLate')}</span>
              <PeoplePicker ctx={ctx} picked={d.late.people} disabled={disabled} showLate onChange={(people) => set({ late: { ...d.late, people } })} />
            </div>
          )}
          <Field label={t('stock.prod.why.lateWhy')}>
            <Input value={d.late.why} disabled={disabled} maxLength={300} onChange={(e) => set({ late: { ...d.late, why: e.target.value } })} />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-body-sm font-medium text-text">{t('stock.prod.why.genuine')}</span>
            <div className="flex flex-wrap gap-2">
              {(['yes', 'no', 'unsure'] as const).map((g) => (
                <Chip key={g} on={d.late.genuine === g} disabled={disabled} label={t(`stock.prod.why.${g}` as I18nKey)} onClick={() => set({ late: { ...d.late, genuine: g } })} />
              ))}
            </div>
          </div>
        </fieldset>
      )}

      {d.kinds.includes('long_break') && (
        <fieldset className="flex flex-col gap-3 rounded-md bg-surface p-3">
          <legend className="sr-only">{t('stock.prod.why.longBreak')}</legend>
          <p className="text-body-sm font-semibold text-text">{t('stock.prod.why.longBreak')}</p>
          <p className="text-label text-text-3">{t('stock.prod.why.breakHint')}</p>
          {ctx && ctx.staff.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-body-sm font-medium text-text">{t('stock.prod.why.whoBreak')}</span>
              <PeoplePicker ctx={ctx} picked={d.longBreak.people} disabled={disabled} onChange={(people) => set({ longBreak: { ...d.longBreak, people } })} />
            </div>
          )}
          {breakIds(d, ctx).map((id) => {
            const e = d.longBreak.byPerson[id] || emptyBreak();
            const put = (patch: Partial<BreakEntry>) => set({ longBreak: { ...d.longBreak, byPerson: { ...d.longBreak.byPerson, [id]: { ...e, ...patch } } } });
            const who = ctx?.staff.find((p) => p.id === id)?.name;
            return (
              <div key={id} className={cn('flex flex-col gap-3', who && 'rounded-md border border-border p-3')}>
                {who && <p className="text-body-sm font-semibold text-text">{who}</p>}
                <Field label={t('stock.prod.why.extraMin')} optional>
                  <Input type="number" inputMode="numeric" min={0} max={480} className="num" value={e.minutes} disabled={disabled} onChange={(ev) => put({ minutes: ev.target.value })} />
                </Field>
                <Field label={t('stock.prod.why.breakWhy')}>
                  <Input value={e.why} disabled={disabled} maxLength={300} onChange={(ev) => put({ why: ev.target.value })} />
                </Field>
                <div className="flex flex-col gap-1.5">
                  <span className="text-body-sm font-medium text-text">{t('stock.prod.why.genuine')}</span>
                  <div className="flex flex-wrap gap-2">
                    {(['yes', 'no', 'unsure'] as const).map((g) => (
                      <Chip key={g} on={e.genuine === g} disabled={disabled} label={t(`stock.prod.why.${g}` as I18nKey)} onClick={() => put({ genuine: g })} />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </fieldset>
      )}

      {d.kinds.includes('machine') && (
        <fieldset className="flex flex-col gap-3 rounded-md bg-surface p-3">
          <legend className="sr-only">{t('stock.prod.why.machine')}</legend>
          <p className="text-body-sm font-semibold text-text">{t('stock.prod.why.machine')}</p>
          <Field label={t('stock.prod.why.machineName')}>
            <Input list="leftover-machines" value={d.machine.machine} disabled={disabled} maxLength={80} onChange={(e) => set({ machine: { ...d.machine, machine: e.target.value } })} />
          </Field>
          <datalist id="leftover-machines">{machineNames.map((m) => <option key={m} value={m} />)}</datalist>
          <div className="flex items-end gap-2">
            <Field label={t('stock.prod.why.downFrom')} className="flex-1">
              <Input type="time" className="num" value={d.machine.downFrom} disabled={disabled} onChange={(e) => set({ machine: { ...d.machine, downFrom: e.target.value } })} />
            </Field>
            <Field label={t('stock.prod.why.downTo')} className="flex-1">
              <Input type="time" className="num" value={d.machine.downTo} disabled={disabled || d.machine.stillDown} onChange={(e) => set({ machine: { ...d.machine, downTo: e.target.value } })} />
            </Field>
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <Checkbox checked={d.machine.stillDown} disabled={disabled} onCheckedChange={(c) => set({ machine: { ...d.machine, stillDown: c === true } })} />
            <span className="text-body-sm text-text">{t('stock.prod.why.stillDown')}</span>
          </label>
          <Field label={t('stock.prod.why.alternative')} helper={t('stock.prod.why.alternativeHint')}>
            <Input value={d.machine.alternative} disabled={disabled} maxLength={300} onChange={(e) => set({ machine: { ...d.machine, alternative: e.target.value } })} />
          </Field>
          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <Checkbox checked={d.machine.raiseRepair} disabled={disabled} onCheckedChange={(c) => set({ machine: { ...d.machine, raiseRepair: c === true } })} />
            <span className="text-body-sm text-text">{t('stock.prod.why.raiseRepair')}</span>
          </label>
        </fieldset>
      )}

      {d.kinds.includes('low_demand') && <div className="rounded-md bg-surface p-3">{noteField('low_demand', 'stock.prod.why.note')}</div>}
      {d.kinds.includes('planned') && <div className="rounded-md bg-surface p-3">{noteField('planned', 'stock.prod.why.note')}</div>}
      {d.kinds.includes('short_staff') && (
        <div className="flex flex-col gap-3 rounded-md bg-surface p-3">
          <p className="text-body-sm font-semibold text-text">{t('stock.prod.why.shortStaff')}</p>
          {ctx && ctx.staff.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-body-sm font-medium text-text">{t('stock.prod.why.whoMissing')}</span>
              <PeoplePicker ctx={ctx} picked={d.missing} disabled={disabled} onChange={(missing) => set({ missing })} />
            </div>
          )}
          {noteField('short_staff', 'stock.prod.why.note')}
        </div>
      )}
      {d.kinds.includes('other') && <div className="rounded-md bg-surface p-3">{noteField('other', 'stock.prod.why.otherNote')}</div>}
    </div>
  );
}

/** The saved reasons on a closed day. */
export function LeftoverReportView({ report }: { report: LeftoverReport & { leftoverKg?: number; by?: string } }) {
  const { t } = useT();
  const fmt = (hhmm?: string | null) => {
    if (!hhmm || !TIME.test(hhmm)) return '';
    const [h, m] = hhmm.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  };
  const line = (r: any): string => {
    if (r.kind === 'power_cut') return (r.periods || []).map((p: any) => `${fmt(p.from)}–${fmt(p.to)}`).join(', ');
    if (r.kind === 'late_start') {
      const who = (r.people || []).map((p: any) => p.name).join(', ');
      const genuine = r.genuine ? t(`stock.prod.why.${r.genuine}` as I18nKey) : '';
      return [r.startedAt ? `${t('stock.prod.why.startedAt')} ${fmt(r.startedAt)}` : '', who, r.why, genuine ? `${t('stock.prod.why.genuine')} ${genuine}` : ''].filter(Boolean).join(' · ');
    }
    if (r.kind === 'long_break') {
      return (r.entries || []).map((e: any) => [
        e.name, e.minutes ? t('stock.prod.why.extraMinShort', { n: e.minutes }) : '', e.why,
        e.genuine ? `${t('stock.prod.why.genuine')} ${t(`stock.prod.why.${e.genuine}` as I18nKey)}` : '',
      ].filter(Boolean).join(' · ')).join('; ');
    }
    if (r.kind === 'machine') {
      return [r.machine, r.stillDown ? `${fmt(r.downFrom)} → ${t('stock.prod.why.stillDown')}` : `${fmt(r.downFrom)}–${fmt(r.downTo)}`, r.alternative, r.repairAlertId ? t('stock.prod.why.repairSent') : ''].filter(Boolean).join(' · ');
    }
    return [(r.people || []).map((p: any) => p.name).join(', '), r.note].filter(Boolean).join(' · ');
  };
  return (
    <>
      <Callout tone="neutral" title={`${t('stock.prod.why.saved')}${report.leftoverKg ? ` · ${Math.round(report.leftoverKg * 10) / 10} kg` : ''}`}>
        <ul className="flex flex-col gap-1">
          {report.reasons.map((r) => (
            <li key={r.kind} className="text-body-sm text-text-2"><span className="font-medium text-text">{t(leftoverKindLabel(r.kind))}</span>{line(r) ? `: ${line(r)}` : ''}</li>
          ))}
        </ul>
      </Callout>
      {report.lateCheck?.issues?.length ? (
        <Callout tone="warning" icon={AlertTriangle} title={t('stock.prod.why.lateCheckTitle')}>
          <ul className="flex list-disc flex-col gap-0.5 pl-4">
            {report.lateCheck.issues.map((x) => <li key={x} className="text-body-sm">{x}</li>)}
          </ul>
        </Callout>
      ) : null}
    </>
  );
}
