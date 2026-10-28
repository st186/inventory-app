// One person's own attendance: their timesheets, leave applications and leave balance, loaded
// once for the whole Attendance and leave page (the timesheet and leave parts used to fetch the
// leave list twice).
import * as React from 'react';
import { teamApi } from '../teamApi';
import type { LeaveRow } from './useTeamAttendance';

export interface TimesheetEntry {
  id?: string;
  employeeId: string;
  date: string;
  startTime: string;
  endTime: string;
  totalHours: number;
  status: 'pending' | 'approved' | 'rejected';
  isLeave: boolean;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
}

export function useMyAttendance(employeeId: string) {
  const [timesheetData, setTimesheetData] = React.useState<TimesheetEntry[]>([]);
  // Each date's start|end as last saved, so Send only lights up when something changed.
  const [savedSignatures, setSavedSignatures] = React.useState<Record<string, string>>({});
  const [leaves, setLeaves] = React.useState<LeaveRow[]>([]);
  const [leaveBalance, setLeaveBalance] = React.useState<number | null>(null);
  const [pendingDays, setPendingDays] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadTimesheets = React.useCallback(async () => {
    const data = (await teamApi.getTimesheets(employeeId)) as unknown as TimesheetEntry[];
    setTimesheetData(data);
    const sigs: Record<string, string> = {};
    data.forEach((t) => {
      sigs[t.date] = `${t.startTime}|${t.endTime}`;
    });
    setSavedSignatures(sigs);
  }, [employeeId]);

  const loadLeaves = React.useCallback(async () => {
    setLeaves((await teamApi.getLeaves(employeeId)) as LeaveRow[]);
  }, [employeeId]);

  // The server reads the joining date from the staff record and counts all leave since the 1 Aug 2026 reset (it carries into the next year).
  const loadBalance = React.useCallback(async () => {
    try {
      const { balance, pendingDays: pending } = await teamApi.getLeaveBalance(employeeId);
      setLeaveBalance(balance);
      setPendingDays(pending);
    } catch (e) {
      console.error('Error calculating leave balance:', e);
    }
  }, [employeeId]);

  const loadAll = React.useCallback(async () => {
    if (!employeeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadTimesheets(), loadLeaves(), loadBalance()]);
    } catch (e) {
      console.error('Error loading attendance:', e);
      setError(e instanceof Error ? e.message : 'Could not load your attendance');
    } finally {
      setLoading(false);
    }
  }, [employeeId, loadTimesheets, loadLeaves, loadBalance]);

  React.useEffect(() => {
    loadAll();
  }, [loadAll]);

  return {
    employeeId,
    loading,
    error,
    reload: loadAll,
    timesheetData,
    setTimesheetData,
    savedSignatures,
    loadTimesheets,
    leaves,
    loadLeaves,
    leaveBalance,
    pendingDays,
    // Projected = balance minus the days still waiting (can go negative with advance leave).
    projectedBalance: leaveBalance === null ? null : leaveBalance - pendingDays,
    loadBalance,
  };
}

export type MyAttendance = ReturnType<typeof useMyAttendance>;
