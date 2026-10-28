// My leave (Me → Attendance and leave): leave applications with their status, delete while still
// waiting, and a sticky "Apply for leave" that opens the application sheet (regular or advance).
// Same rules as before: a regular application can't go over the balance (days still waiting count
// too); advance leave borrows from next month and over 4 days goes to the owner instead of the
// manager. While choosing the days it shows who else in the team is already off then (owner, 28
// Oct 2026), so two people from one store or kitchen don't take the same day.
import * as React from 'react';
import { BookOpen, CalendarPlus, CalendarDays, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { Callout } from './ui/callout';
import { EmptyState } from './ui/empty-state';
import { Field } from './ui/field';
import { IconButton } from './ui/icon-button';
import { Input } from './ui/input';
import { ListGroup, ListRow } from './ui/list-row';
import { ResponsiveModal } from './ui/responsive-modal';
import { SegmentedControl } from './ui/segmented-control';
import { StatusChip } from './ui/status-chip';
import { confirm } from './ui/confirm';
import { toast } from './ui/sonner';
import { DatePicker } from './DatePicker';
import { addDays } from '../utils/timezone';
import { useT } from '../utils/i18n';
import type * as api from '../utils/api';
import { teamApi } from './team/teamApi';
import { StickyFooter, formatDay } from './team/shared';
import type { MyAttendance } from './team/attendance/useMyAttendance';
import { leaveTypeLabel } from './ApproveLeaves';
import { leaveDays, placeLabel } from './team/teamLeave';

const MAX_ADVANCE_DAYS_BEFORE_ESCALATION = 4;

interface EmployeeLeaveProps {
  user: { employeeId: string; name: string; email: string; joiningDate?: string };
  att: MyAttendance;
}

const getDateRange = (start: string, end: string) => {
  const dates: string[] = [];
  const last = end || start;
  let current = start;
  while (current <= last) {
    dates.push(current);
    current = addDays(current, 1);
  }
  return dates;
};

export function EmployeeLeave({ user, att }: EmployeeLeaveProps) {
  const { t, lang } = useT();
  const [applyOpen, setApplyOpen] = React.useState(false);
  const [policyOpen, setPolicyOpen] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const sorted = [...att.leaves].sort((a, b) => new Date(b.leaveDate).getTime() - new Date(a.leaveDate).getTime());

  const handleDelete = async (leave: (typeof att.leaves)[number]) => {
    if (!leave.id) return;
    const ok = await confirm({ title: t('team.leave.deleteTitle'), body: formatDay(leave.leaveDate, lang, { weekday: true }), confirmLabel: t('team.leave.delete'), tone: 'danger' });
    if (!ok) return;
    try {
      setDeletingId(leave.id);
      await teamApi.deleteLeave(leave.id);
      await att.loadLeaves();
      await att.loadBalance();
      toast.success(t('team.leave.deleted'));
    } catch (error) {
      toast.error((error as Error)?.message || t('team.leave.deleteFailed'));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <section className="flex flex-col gap-2" aria-labelledby="my-leave-h">
        <div className="flex min-h-11 items-center justify-between gap-2">
          <h2 id="my-leave-h" className="text-subtitle font-semibold text-text">{t('team.leave.title')}</h2>
          <Button variant="link" size="sm" leadingIcon={<BookOpen />} onClick={() => setPolicyOpen(true)}>
            {t('team.leave.howItWorks')}
          </Button>
        </div>
        {sorted.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface">
            <EmptyState compact icon={CalendarDays} title={t('team.leave.none')} body={t('team.leave.noneBody')} />
          </div>
        ) : (
          <ListGroup>
            {sorted.map((leave) => (
              <ListRow
                key={leave.id || leave.leaveDate}
                title={formatDay(leave.leaveDate, lang, { weekday: true })}
                subtitle={[
                  leaveTypeLabel(leave, t),
                  leave.reason,
                  leave.isAdvanceLeave && leave.status === 'pending' && leave.approverRole ? (leave.approverRole === 'cluster_head' ? t('team.att.toOwner') : t('team.att.toManager')) : '',
                  leave.appliedAt ? t('team.att.askedOn', { date: formatDay(leave.appliedAt.slice(0, 10), lang, { short: true }) }) : '',
                  leave.approvedBy ? t('team.att.by', { name: leave.approvedBy }) : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
                trailing={
                  <span className="flex items-center gap-1">
                    <StatusChip status={leave.status === 'approved' ? 'approval.approved' : leave.status === 'rejected' ? 'approval.rejected' : 'approval.pending'} />
                    {leave.status === 'pending' && leave.id && (
                      <IconButton label={t('team.leave.delete')} icon={<Trash2 />} variant="danger-ghost" loading={deletingId === leave.id} onClick={() => handleDelete(leave)} />
                    )}
                  </span>
                }
              />
            ))}
          </ListGroup>
        )}
      </section>

      <StickyFooter>
        <Button size="lg" className="flex-1" leadingIcon={<CalendarPlus />} onClick={() => setApplyOpen(true)}>
          {t('team.leave.apply')}
        </Button>
      </StickyFooter>

      <ApplyLeaveSheet open={applyOpen} onOpenChange={setApplyOpen} user={user} att={att} />

      <ResponsiveModal open={policyOpen} onOpenChange={setPolicyOpen} title={t('team.leave.howItWorks')}>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-body-sm text-text-2">
          <li>{t('team.leave.p1')}</li>
          <li>{t('team.leave.p2')}</li>
          <li>{t('team.leave.p3')}</li>
          <li>{t('team.leave.p4')}</li>
          <li>{t('team.leave.p5')}</li>
          <li>{t('team.leave.p6', { n: MAX_ADVANCE_DAYS_BEFORE_ESCALATION })}</li>
          <li>{t('team.leave.p7')}</li>
        </ul>
      </ResponsiveModal>
    </>
  );
}

function ApplyLeaveSheet({ open, onOpenChange, user, att }: { open: boolean; onOpenChange: (o: boolean) => void; user: EmployeeLeaveProps['user']; att: MyAttendance }) {
  const { t, lang } = useT();
  const [mode, setMode] = React.useState<'regular' | 'advance'>('regular');
  const [form, setForm] = React.useState({ startDate: '', endDate: '', leaveType: 'full' as 'full' | 'half', reason: '' });
  const [saving, setSaving] = React.useState(false);
  const isSingleDay = !form.endDate || form.startDate === form.endDate;
  const leaveBalance = att.leaveBalance ?? 0;
  const projectedBalance = att.projectedBalance ?? 0;

  // Who else is off on the chosen days: today to the end of next month, or the chosen days
  // themselves when they go past that.
  const [cal, setCal] = React.useState<api.TeamLeaveCalendar | null>(null);
  const lastChosen = form.endDate || form.startDate;
  const outside = !!cal && !!form.startDate && (form.startDate < cal.from || lastChosen > cal.to);
  React.useEffect(() => {
    if (!open) {
      setCal(null);
      return;
    }
    if (cal && !outside) return;
    let cancelled = false;
    const call = outside ? teamApi.getTeamLeaveCalendar(undefined, form.startDate, lastChosen) : teamApi.getTeamLeaveCalendar();
    call.then((c) => { if (!cancelled) setCal(c); }).catch(() => undefined);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, outside]);
  const othersOff = cal && form.startDate && lastChosen >= form.startDate ? leaveDays(cal, getDateRange(form.startDate, lastChosen), user.employeeId) : [];
  const samePlace = !!cal?.myPlaceKey && othersOff.some((d) => d.people.some((p) => p.placeKey === cal.myPlaceKey));

  const reset = () => {
    setMode('regular');
    setForm({ startDate: '', endDate: '', leaveType: 'full', reason: '' });
  };

  const applyLeave = async () => {
    if (!form.startDate || !form.reason) return toast.error(t('team.leave.fillAll'));
    const endDate = form.endDate || form.startDate;
    if (endDate < form.startDate) return toast.error(t('team.leave.endBeforeStart'));
    const dates = getDateRange(form.startDate, endDate);
    // Several days are always full days; half day is for one date only.
    const effectiveType = dates.length > 1 ? 'full' : form.leaveType;
    // A rejected application doesn't block asking again for that date.
    const conflicting = dates.filter((d) => att.leaves.find((l) => l.leaveDate === d && l.status !== 'rejected'));
    if (conflicting.length > 0) return toast.error(t('team.leave.already', { dates: conflicting.map((d) => formatDay(d, lang, { short: true })).join(', ') }));
    const requestedDays = dates.length * (effectiveType === 'half' ? 0.5 : 1);
    const isAdvance = mode === 'advance';
    // Advance leave over the limit isn't blocked; it goes to the owner instead of the manager.
    const approverRole: 'manager' | 'cluster_head' = requestedDays > MAX_ADVANCE_DAYS_BEFORE_ESCALATION ? 'cluster_head' : 'manager';
    if (!isAdvance && projectedBalance < requestedDays) {
      return toast.error(
        att.pendingDays > 0
          ? t('team.leave.notEnoughPending', { balance: leaveBalance, pending: att.pendingDays, left: projectedBalance })
          : t('team.leave.notEnough', { balance: leaveBalance }),
      );
    }
    if (isAdvance && requestedDays > MAX_ADVANCE_DAYS_BEFORE_ESCALATION) {
      const ok = await confirm({
        title: t('team.leave.escalateTitle', { n: requestedDays }),
        body: t('team.leave.escalateBody', { max: MAX_ADVANCE_DAYS_BEFORE_ESCALATION }),
        confirmLabel: t('team.leave.sendToOwner'),
      });
      if (!ok) return;
    }
    try {
      setSaving(true);
      const appliedAt = new Date().toISOString();
      const leavesToApply: api.LeaveApplication[] = dates.map((date) => ({
        employeeId: user.employeeId,
        leaveDate: date,
        leaveType: effectiveType,
        isAdvanceLeave: isAdvance,
        ...(isAdvance ? { advanceDaysRequested: requestedDays, approverRole } : {}),
        reason: form.reason,
        status: 'pending',
        appliedAt,
      }));
      // One bulk call: one "applied for leave: 13 to 15 Apr" notification instead of one per day.
      await teamApi.applyLeaveBulk(leavesToApply);
      await att.loadLeaves();
      await att.loadBalance();
      const approver = isAdvance && approverRole === 'cluster_head' ? t('team.leave.theOwner') : t('team.leave.yourManager');
      toast.success(dates.length > 1 ? t('team.leave.sentDays', { n: dates.length, to: approver }) : t('team.leave.sent', { to: approver }));
      onOpenChange(false);
    } catch (error) {
      console.error('Error applying leave:', error);
      // The server re-checks the balance and says why it refused.
      toast.error(error instanceof Error && error.message ? error.message : t('team.leave.failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      onClosed={reset}
      dirty={!!(form.startDate || form.reason)}
      title={t('team.leave.apply')}
      description={att.leaveBalance !== null ? t('team.leave.balanceLine', { n: leaveBalance }) : undefined}
      footer={
        <Button size="lg" className="flex-1" loading={saving} onClick={applyLeave}>
          {t('team.leave.submit')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <SegmentedControl
          aria-label={t('team.leave.kind')}
          value={mode}
          onValueChange={setMode}
          options={[
            { value: 'regular', label: t('team.leave.regular') },
            { value: 'advance', label: t('team.leave.advance') },
          ]}
        />
        {mode === 'advance' && <Callout tone="warning" title={t('team.leave.advanceTitle')}>{t('team.leave.advanceBody', { max: MAX_ADVANCE_DAYS_BEFORE_ESCALATION })}</Callout>}
        {/* DatePicker, not a raw date input: the Android WebView wheel could submit a day other
            than the one shown. */}
        <DatePicker
          label={t('team.leave.from')}
          value={form.startDate}
          onChange={(date) => setForm({ ...form, startDate: date, endDate: form.endDate && form.endDate < date ? date : form.endDate })}
          className="w-full"
        />
        <div className="flex flex-col gap-1.5">
          <DatePicker label={t('team.leave.to')} value={form.endDate} onChange={(date) => setForm({ ...form, endDate: date })} min={form.startDate || undefined} className="w-full" />
          <p className="text-caption text-text-3">{t('team.leave.toHelp')}</p>
        </div>
        {cal && othersOff.length > 0 && (
          <Callout tone={samePlace ? 'warning' : 'info'} title={t('teamLeave.alsoOffTitle')}>
            <ul className="flex flex-col gap-1">
              {othersOff.map((d) => (
                <li key={d.date}>
                  <span className="font-medium">{formatDay(d.date, lang, { short: true, weekday: true })}:</span>{' '}
                  {d.people
                    .map((p) => `${p.name} (${[placeLabel(cal, p.placeKey, t), p.leaveType === 'half' ? t('team.att.halfDay') : '', p.status === 'pending' ? t('teamLeave.waiting') : ''].filter(Boolean).join(', ')})`)
                    .join(', ')}
                </li>
              ))}
            </ul>
            {samePlace && <p className="mt-2">{t('teamLeave.samePlace')}</p>}
          </Callout>
        )}
        <Field label={t('team.leave.type')} helper={!isSingleDay ? t('team.leave.halfOnlyOne') : undefined}>
          <SegmentedControl
            aria-label={t('team.leave.type')}
            value={isSingleDay ? form.leaveType : 'full'}
            disabled={!isSingleDay}
            onValueChange={(v) => setForm({ ...form, leaveType: v })}
            options={[
              { value: 'full', label: t('team.att.fullDay') },
              { value: 'half', label: t('team.att.halfDay') },
            ]}
          />
        </Field>
        <Field label={t('team.att.reason')} required>
          <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </Field>
      </div>
    </ResponsiveModal>
  );
}
