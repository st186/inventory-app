// Extra hours to confirm (owner, 28 Oct 2026): days someone worked 30+ minutes beyond their shift,
// going by the check-in and check-out. Their incharge (or the owner / an operations manager)
// confirms the time was needed and why - every 4 confirmed hours in a month add a point to the
// person's KPI total (at most 5), which raises their variable pay - or marks it not needed.
import * as React from 'react';
import { CheckCircle2, Clock3, X } from 'lucide-react';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/empty-state';
import { Field } from '../ui/field';
import { Input } from '../ui/input';
import { ResponsiveModal } from '../ui/responsive-modal';
import { toast } from '../ui/sonner';
import { cn } from '../ui/utils';
import * as kpi from './kpiApi';

export function useExtraHours(enabled: boolean) {
  const [days, setDays] = React.useState<kpi.ExtraHoursDay[]>([]);
  const reload = React.useCallback(() => {
    if (!enabled) return;
    kpi.getExtraHours().then((r) => setDays(r.days || [])).catch(() => undefined);
  }, [enabled]);
  React.useEffect(() => { reload(); }, [reload]);
  return { days, reload };
}

const REASONS = ['Big order', 'Covering for someone', 'Machine breakdown', 'Stock count', 'Event'];
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
export const hoursText = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}` : `${min} min`);

function DayCard({ day, onDone }: { day: kpi.ExtraHoursDay; onDone: () => void }) {
  const [reason, setReason] = React.useState('');
  const [hours, setHours] = React.useState(String(Math.round((day.minutes / 60) * 10) / 10));
  const [busy, setBusy] = React.useState<'confirm' | 'decline' | null>(null);
  const decide = async (decision: 'confirm' | 'decline') => {
    if (decision === 'confirm' && reason.trim().length < 3) {
      toast.error('Say why the extra time was needed');
      return;
    }
    setBusy(decision);
    try {
      const minutes = Math.round((parseFloat(hours) || 0) * 60);
      await kpi.decideExtraHours({ employeeId: day.employeeId, date: day.date, decision, reason: reason.trim(), minutes: minutes > 0 ? minutes : undefined });
      toast.success(decision === 'confirm' ? 'Extra hours confirmed' : 'Marked not needed');
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save that');
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="text-body-md font-semibold text-text">{day.name}</span>
          <span className="num text-label text-text-3">
            {new Date(`${day.date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} · in {timeOf(day.inAt)} · out {timeOf(day.outAt)} · shift {kpi.hhmm12(day.shiftStart)}–{kpi.hhmm12(day.shiftEnd)}
          </span>
        </div>
        <span className="num shrink-0 text-body-md font-semibold text-primary">+{hoursText(day.minutes)}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {REASONS.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={reason === r}
            onClick={() => setReason(reason === r ? '' : r)}
            className={cn(
              'hit-44 inline-flex min-h-9 items-center rounded-full border px-3 text-label font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring',
              reason === r ? 'border-primary bg-primary-soft font-semibold text-primary' : 'border-border-strong bg-surface text-text',
            )}
          >
            {r}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <Field label="Why it was needed">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Pick one above or write it" />
        </Field>
        <Field label="Hours" className="w-24">
          <Input type="number" inputMode="decimal" min={0} step={0.5} value={hours} onChange={(e) => setHours(e.target.value)} className="num" />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" leadingIcon={<CheckCircle2 />} loading={busy === 'confirm'} disabled={!!busy} onClick={() => decide('confirm')}>Confirm</Button>
        <Button size="sm" variant="secondary" leadingIcon={<X />} loading={busy === 'decline'} disabled={!!busy} onClick={() => decide('decline')}>Not needed</Button>
      </div>
    </div>
  );
}

export function ExtraHoursSheet({ open, onOpenChange, days, onChanged }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  days: kpi.ExtraHoursDay[];
  onChanged: () => void;
}) {
  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Extra hours to confirm"
      description="Time beyond the shift, from check-in and check-out. Confirm only what the work needed: every 4 confirmed hours in a month add a KPI point (up to 5), which raises variable pay. You can lower the hours, never raise them."
      size="detail"
    >
      {days.length === 0 ? (
        <EmptyState compact icon={Clock3} title="Nothing to confirm" body="Days with 30+ minutes beyond the shift show up here." />
      ) : (
        <div className="flex flex-col gap-3">
          {days.map((d) => <DayCard key={`${d.employeeId}-${d.date}`} day={d} onDone={onChanged} />)}
        </div>
      )}
    </ResponsiveModal>
  );
}
