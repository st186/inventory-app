// My timesheet (Me → Attendance and leave): the week as a list of days; tap a day to enter time
// in / time out and send it for approval. "Send week" sends every changed day at once and "Copy
// last week" fills empty days from last week. Same rules as before: today or earlier only, no time
// later than now, at least 4 hours, and a sent day is locked until it's approved or rejected. A day
// with a shift check-in and check-out fills itself (server punchTimesheet.ts, owner 31 Oct 2026).
import * as React from 'react';
import { ChevronLeft, ChevronRight, Copy, Send } from 'lucide-react';
import { Button } from './ui/button';
import { Callout } from './ui/callout';
import { Field } from './ui/field';
import { IconButton } from './ui/icon-button';
import { Input } from './ui/input';
import { ListGroup, ListRow } from './ui/list-row';
import { ResponsiveModal } from './ui/responsive-modal';
import { StatusChip } from './ui/status-chip';
import { toast } from './ui/sonner';
import { useT } from '../utils/i18n';
import { teamApi } from './team/teamApi';
import { formatDay } from './team/shared';
import type { MyAttendance, TimesheetEntry } from './team/attendance/useMyAttendance';

interface EmployeeTimesheetProps {
  user: { employeeId: string; name: string; email: string };
  att: MyAttendance;
}

// Local date (not toISOString, which rolls IST midnight back to "yesterday" in UTC).
function getLocalDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  return new Date(d.setDate(diff));
}
function getWeekDates(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
}
const isFutureDate = (date: Date) => getLocalDateString(date) > getLocalDateString(new Date());
function getCurrentTimeString(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}
const isFutureTimeToday = (date: Date, time: string) => !!time && getLocalDateString(date) === getLocalDateString(new Date()) && time > getCurrentTimeString();
function calculateHours(startTime: string, endTime: string): number {
  if (!startTime || !endTime) return 0;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  return (eh * 60 + em - (sh * 60 + sm)) / 60;
}

export function EmployeeTimesheet({ user, att }: EmployeeTimesheetProps) {
  const { t, lang } = useT();
  const [weekStart, setWeekStart] = React.useState<Date>(() => getWeekStart(new Date()));
  const [openDay, setOpenDay] = React.useState<Date | null>(null);
  const [busy, setBusy] = React.useState(false);
  const { timesheetData, setTimesheetData, savedSignatures } = att;

  const blocking = att.leaves.filter((l) => l.status === 'approved' || l.status === 'pending');
  const isOnLeave = (date: Date) => blocking.some((l) => l.leaveDate === getLocalDateString(date));
  const isDirty = (entry: TimesheetEntry) => savedSignatures[entry.date] !== `${entry.startTime}|${entry.endTime}`;

  const getTimesheetEntry = (date: Date): TimesheetEntry => {
    const dateStr = getLocalDateString(date);
    return (
      timesheetData.find((x) => x.date === dateStr) || {
        employeeId: user.employeeId,
        date: dateStr,
        startTime: '',
        endTime: '',
        totalHours: 0,
        status: 'pending',
        isLeave: isOnLeave(date),
      }
    );
  };

  const handleTimeChange = (date: Date, field: 'startTime' | 'endTime', value: string) => {
    const dateStr = getLocalDateString(date);
    const existing = timesheetData.find((x) => x.date === dateStr);
    const entry: TimesheetEntry = existing
      ? { ...existing, [field]: value }
      : { employeeId: user.employeeId, date: dateStr, startTime: field === 'startTime' ? value : '', endTime: field === 'endTime' ? value : '', totalHours: 0, status: 'pending', isLeave: false };
    entry.totalHours = calculateHours(entry.startTime, entry.endTime);
    setTimesheetData([...timesheetData.filter((x) => x.date !== dateStr), entry]);
  };

  const saveSingleDay = async (date: Date) => {
    const entry = getTimesheetEntry(date);
    if (!entry.startTime || !entry.endTime) return toast.error(t('team.ts.bothTimes'));
    if (isFutureDate(date)) return toast.error(t('team.ts.noFuture'));
    if (isFutureTimeToday(date, entry.startTime) || isFutureTimeToday(date, entry.endTime)) return toast.error(t('team.ts.noLaterThanNow'));
    if (entry.totalHours < 4) return toast.error(t('team.ts.minHours'));
    try {
      setBusy(true);
      await teamApi.saveTimesheet({ ...entry, status: 'pending', rejectedBy: undefined, rejectedAt: undefined, rejectionReason: undefined } as never);
      await att.loadTimesheets();
      toast.success(t('team.ts.sent'));
      setOpenDay(null);
    } catch (error) {
      console.error('Error saving timesheet:', error);
      toast.error(t('team.ts.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const saveWeek = async () => {
    const filled = getWeekDates(weekStart)
      .map((date) => ({ date, entry: getTimesheetEntry(date) }))
      .filter(({ entry }) => entry.startTime && entry.endTime);
    if (filled.length === 0) return toast.error(t('team.ts.nothingFilled'));
    // Only days changed since the last load go out (resending kept restarting the approval clock).
    const entries = filled.filter(({ entry }) => entry.status !== 'approved' && isDirty(entry));
    if (entries.length === 0) return toast.info(t('team.ts.nothingNew'));
    for (const { date, entry } of entries) {
      const day = formatDay(entry.date, lang, { weekday: true, short: true });
      if (isFutureDate(date)) return toast.error(`${day}: ${t('team.ts.noFuture')}`);
      if (isFutureTimeToday(date, entry.startTime) || isFutureTimeToday(date, entry.endTime)) return toast.error(`${day}: ${t('team.ts.noLaterThanNow')}`);
      if (entry.totalHours < 4) return toast.error(`${day}: ${t('team.ts.minHours')}`);
    }
    // An edited rejected day is a fresh submission: back to pending, old rejection cleared.
    const bulk = entries.map(({ entry }) => ({ ...entry, status: 'pending' as const, rejectedBy: undefined, rejectedAt: undefined, rejectionReason: undefined }));
    try {
      setBusy(true);
      await teamApi.saveTimesheetBulk(bulk as never);
      await att.loadTimesheets();
      toast.success(t('team.ts.sentDays', { n: bulk.length }));
    } catch (error) {
      console.error('Error saving week timesheet:', error);
      toast.error(t('team.ts.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const copyFromPreviousWeek = async () => {
    try {
      setBusy(true);
      const prevStart = new Date(weekStart);
      prevStart.setDate(prevStart.getDate() - 7);
      const all = (await teamApi.getTimesheets(user.employeeId)) as unknown as TimesheetEntry[];
      const previous = getWeekDates(prevStart).map((d) => all.find((x) => x.date === getLocalDateString(d)));
      if (!previous.some(Boolean)) return toast.info(t('team.ts.nothingLastWeek'));
      const fresh: TimesheetEntry[] = [];
      getWeekDates(weekStart).forEach((date, i) => {
        const dateStr = getLocalDateString(date);
        const prev = previous[i];
        const existing = timesheetData.find((x) => x.date === dateStr);
        if (!isOnLeave(date) && !isFutureDate(date) && prev && prev.startTime && prev.endTime) {
          // Only an empty, unsent or rejected day - never an approved one or one waiting for approval.
          if (!existing || existing.status === 'rejected' || (!existing.id && existing.status !== 'approved')) {
            fresh.push({ employeeId: user.employeeId, date: dateStr, startTime: prev.startTime, endTime: prev.endTime, totalHours: prev.totalHours, status: 'pending', isLeave: false });
          }
        }
      });
      if (fresh.length === 0) return toast.info(t('team.ts.nothingToCopy'));
      const updated = [...timesheetData];
      fresh.forEach((e) => {
        const idx = updated.findIndex((x) => x.date === e.date);
        if (idx >= 0) updated[idx] = e;
        else updated.push(e);
      });
      setTimesheetData(updated);
      toast.success(t('team.ts.copied', { n: fresh.length }));
    } catch (error) {
      console.error('Error copying from previous week:', error);
      toast.error(t('team.ts.copyFailed'));
    } finally {
      setBusy(false);
    }
  };

  const shiftWeek = (days: number) => {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + days);
    setWeekStart(next);
  };

  const dates = getWeekDates(weekStart);
  const weekEnd = dates[6];
  const thisWeek = getLocalDateString(getWeekStart(new Date())) === getLocalDateString(weekStart);
  const todayStr = getLocalDateString(new Date());
  const unsent = dates.map(getTimesheetEntry).filter((e) => e.startTime && e.endTime && e.status !== 'approved' && isDirty(e)).length;

  const statusFor = (date: Date, entry: TimesheetEntry) => {
    if (isOnLeave(date)) return <StatusChip tone="warning">{t('team.ts.leave')}</StatusChip>;
    if (isFutureDate(date)) return null;
    if (entry.startTime && entry.endTime && entry.status !== 'approved' && isDirty(entry)) return <StatusChip status="request.notSent" />;
    if (entry.status === 'approved') return <StatusChip status="approval.approved" />;
    if (entry.status === 'rejected') return <StatusChip status="approval.rejected" />;
    if (entry.startTime && entry.endTime) return <StatusChip status="approval.pending" />;
    return null;
  };

  return (
    <section className="flex flex-col gap-2" aria-labelledby="my-timesheet-h">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <h2 id="my-timesheet-h" className="text-subtitle font-semibold text-text">{thisWeek ? t('team.ts.thisWeek') : t('team.ts.week')}</h2>
          <span className="num text-label text-text-3">{formatDay(getLocalDateString(weekStart), lang, { short: true })} – {formatDay(getLocalDateString(weekEnd), lang, { short: true })}</span>
        </div>
        <span className="flex">
          <IconButton label={t('team.ts.prevWeek')} icon={<ChevronLeft />} onClick={() => shiftWeek(-7)} />
          <IconButton label={t('team.ts.nextWeek')} icon={<ChevronRight />} onClick={() => shiftWeek(7)} disabled={thisWeek} />
        </span>
      </div>
      <ListGroup>
        {dates.map((date) => {
          const entry = getTimesheetEntry(date);
          const dateStr = getLocalDateString(date);
          const onLeave = isOnLeave(date);
          const future = isFutureDate(date);
          const subtitle = onLeave
            ? t('team.ts.onLeave')
            : future
              ? t('team.ts.upcoming')
              : entry.startTime && entry.endTime
                ? `${entry.startTime}–${entry.endTime} · ${t('team.att.hours', { h: entry.totalHours.toFixed(1).replace(/\.0$/, '') })}${entry.source === 'punch' ? ` · ${t('team.ts.fromPunch')}` : ''}${entry.status === 'rejected' && entry.rejectionReason ? ` · ${entry.rejectionReason}` : ''}`
                : entry.startTime || entry.endTime
                  ? `${entry.startTime || '–'}–${entry.endTime || '–'}`
                  : t('team.att.notLogged');
          return (
            <ListRow
              key={dateStr}
              title={
                <span className="flex items-center gap-2">
                  {formatDay(dateStr, lang, { weekday: true, short: true })}
                  {dateStr === todayStr && <StatusChip tone="brand" size="sm">{t('date.today')}</StatusChip>}
                </span>
              }
              subtitle={subtitle}
              muted={future}
              trailing={statusFor(date, entry)}
              chevron={!future && !onLeave}
              onClick={!future && !onLeave ? () => setOpenDay(date) : undefined}
            />
          );
        })}
      </ListGroup>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" leadingIcon={<Copy />} disabled={busy} onClick={copyFromPreviousWeek}>
          {t('team.ts.copyLastWeek')}
        </Button>
        <Button variant="secondary" size="sm" leadingIcon={<Send />} disabled={busy || unsent === 0} onClick={saveWeek}>
          {unsent > 0 ? t('team.ts.sendWeekN', { n: unsent }) : t('team.ts.sendWeek')}
        </Button>
      </div>

      <DaySheet
        date={openDay}
        entry={openDay ? getTimesheetEntry(openDay) : null}
        onClose={() => setOpenDay(null)}
        onChange={handleTimeChange}
        onSend={saveSingleDay}
        dirty={openDay ? isDirty(getTimesheetEntry(openDay)) : false}
        busy={busy}
      />
    </section>
  );
}

function DaySheet({
  date,
  entry,
  onClose,
  onChange,
  onSend,
  dirty,
  busy,
}: {
  date: Date | null;
  entry: TimesheetEntry | null;
  onClose: () => void;
  onChange: (date: Date, field: 'startTime' | 'endTime', value: string) => void;
  onSend: (date: Date) => void;
  dirty: boolean;
  busy: boolean;
}) {
  const { t, lang } = useT();
  if (!date || !entry) return null;
  const isApproved = entry.status === 'approved';
  // A sent day is locked while it waits in someone's approval queue.
  const isLocked = isApproved || (!!entry.id && entry.status === 'pending');
  const maxTime = getLocalDateString(date) === getLocalDateString(new Date()) ? getCurrentTimeString() : undefined;
  const canSubmit = !isLocked && !isFutureDate(date) && !!entry.startTime && !!entry.endTime && (dirty || entry.status === 'rejected');
  const label = entry.status === 'pending' && entry.startTime && entry.endTime && !dirty ? t('team.ts.waiting') : entry.status === 'rejected' ? t('team.ts.resend') : t('team.ts.send');

  return (
    <ResponsiveModal
      open
      onOpenChange={(o) => !o && onClose()}
      title={formatDay(entry.date, lang, { weekday: true })}
      description={t('team.ts.sheetHint')}
      footer={
        isApproved ? undefined : (
          <Button size="lg" className="flex-1" loading={busy} disabled={!canSubmit} onClick={() => onSend(date)}>
            {label}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {entry.source === 'punch' && <Callout tone="info" title={t('team.ts.fromPunch')}>{t('team.ts.fromPunchBody')}</Callout>}
        {isApproved && <Callout tone="success" title={t('status.approved')}>{t('team.ts.approvedBody')}</Callout>}
        {!isApproved && isLocked && <Callout tone="info" title={t('team.ts.waiting')}>{t('team.ts.lockedBody')}</Callout>}
        {entry.status === 'rejected' && <Callout tone="danger" title={t('status.rejected')}>{entry.rejectionReason ? t('team.ts.reason', { reason: entry.rejectionReason }) : t('team.ts.rejectedBody')}</Callout>}
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('team.ts.timeIn')}>
            <Input type="time" value={entry.startTime} max={maxTime} disabled={isLocked} onChange={(e) => onChange(date, 'startTime', e.target.value)} className="num" />
          </Field>
          <Field label={t('team.ts.timeOut')}>
            <Input type="time" value={entry.endTime} max={maxTime} disabled={isLocked} onChange={(e) => onChange(date, 'endTime', e.target.value)} className="num" />
          </Field>
        </div>
        <p className={`num text-body-sm font-medium ${entry.totalHours > 0 ? (entry.totalHours >= 4 ? 'text-success' : 'text-danger') : 'text-text-3'}`}>
          {entry.totalHours > 0 ? t('team.ts.hoursTotal', { h: entry.totalHours.toFixed(2) }) : t('team.ts.enterBoth')}
        </p>
      </div>
    </ResponsiveModal>
  );
}
