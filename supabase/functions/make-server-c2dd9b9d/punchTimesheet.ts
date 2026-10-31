// The timesheet fills itself from the shift check-in and check-out (owner, 31 Oct 2026: "Vijay has
// checked in and checked out, he has to fill the timesheet - why is it not getting updated from
// this?"). Both taps at the workplace: approved straight away, since the approval only ever checked
// the times. Away from the workplace, no location or anything odd: it waits for the approver like a
// typed one. A day the person already sent by hand is left as it is; one filled from the punches
// follows a later End shift. Riders have no workplace to check against and don't fill timesheets.
// Tests: node supabase/functions/make-server-c2dd9b9d/punchTimesheet.test.ts

export const AUTO_APPROVED_BY = 'Checked in and out at work';

const IST_MS = 330 * 60000;
const clock = (ms: number) => new Date(ms + IST_MS).toISOString().slice(11, 16);
const istDay = (ms: number) => new Date(ms + IST_MS).toISOString().slice(0, 10);

type Ev = { at?: string; verified?: boolean; exempt?: boolean } | null | undefined;
export type PunchLike = { employeeId: string; date: string; in?: Ev; out?: Ev; outsideWorkplace?: boolean; flags?: string[] };

/** The timesheet to save for a day's punches, or null when there's nothing to write. */
export function timesheetFromPunch(rec: PunchLike | null, existing: any, nowIso: string): any | null {
  if (!rec?.in?.at || !rec?.out?.at || rec.in.exempt || rec.out.exempt) return null;
  const inMs = Date.parse(rec.in.at);
  const outMs = Date.parse(rec.out.at);
  if (!(outMs > inMs)) return null;
  if (existing && existing.source !== 'punch') return null;
  const startTime = clock(inMs);
  // A shift past midnight ends at 23:59 on the sheet (the form has no next-day time); the hours are the real ones.
  const endTime = istDay(outMs) > rec.date ? '23:59' : clock(outMs);
  if (existing && existing.startTime === startTime && existing.endTime === endTime) return null;
  const atWork = !!rec.in.verified && !!rec.out.verified && !rec.outsideWorkplace && !(rec.flags || []).length;
  return {
    ...(existing?.id ? { id: existing.id } : {}),
    employeeId: rec.employeeId, date: rec.date, startTime, endTime,
    totalHours: Math.round((outMs - inMs) / 36000) / 100,
    isLeave: false, source: 'punch', submittedAt: nowIso,
    ...(atWork ? { status: 'approved', approvedBy: AUTO_APPROVED_BY, approvedAt: nowIso } : { status: 'pending' }),
  };
}
