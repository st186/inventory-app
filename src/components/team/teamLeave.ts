// Who is off and when, from the team leave calendar (GET /team/leave-calendar): the words for a
// workplace and the days that have someone on leave, shared by every Home's team row and the
// leave application sheet.
import type * as api from '../../utils/api';
import type { useT } from '../../utils/i18n';

type T = ReturnType<typeof useT>['t'];

export function placeLabel(cal: api.TeamLeaveCalendar, key: string, t: T): string {
  const place = cal.places.find((p) => p.key === key);
  if (!place) return '';
  if (place.kind === 'riders') return t('teamLeave.riders');
  if (place.kind === 'managers') return t('teamLeave.managers');
  return place.name || t(place.kind === 'store' ? 'teamLeave.store' : 'teamLeave.production');
}

export type LeaveDay = {
  date: string;
  people: api.TeamLeaveDay[];
  /** Workplaces with two or more people off that day. */
  short: { placeKey: string; off: number; of: number }[];
};

/** Days with someone on leave (approved or waiting), in date order. */
export function leaveDays(cal: api.TeamLeaveCalendar, dates?: string[], exceptEmployeeId?: string): LeaveDay[] {
  const byDate = new Map<string, api.TeamLeaveDay[]>();
  for (const l of cal.leaves) {
    if (dates && !dates.includes(l.leaveDate)) continue;
    if (exceptEmployeeId && l.employeeId === exceptEmployeeId) continue;
    byDate.set(l.leaveDate, [...(byDate.get(l.leaveDate) || []), l]);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, people]) => {
      const off = new Map<string, Set<string>>();
      for (const p of people) off.set(p.placeKey, (off.get(p.placeKey) || new Set()).add(p.employeeId));
      const short = [...off.entries()]
        .filter(([, ids]) => ids.size >= 2)
        .map(([placeKey, ids]) => ({ placeKey, off: ids.size, of: cal.places.find((p) => p.key === placeKey)?.people || ids.size }));
      return { date, people, short };
    });
}
