// Team → Attendance data: the people someone approves for (the owner: managers; an incharge: the
// staff under them; a manager: their staff), and each person's timesheets and leave - the same
// endpoints the old approval screens called one person at a time, now loaded for everyone at
// once so the whole queue shows in one list.
import * as React from 'react';
import type * as api from '../../../utils/api';
import { employeeBelongsToStore } from '../../../utils/entityAccess';
import { teamApi } from '../teamApi';

export type TimesheetRow = {
  id: string;
  employeeId: string;
  date: string;
  startTime?: string;
  endTime?: string;
  totalHours?: number;
  status: 'pending' | 'approved' | 'rejected';
  isLeave?: boolean;
  rejectionReason?: string;
};

export type LeaveRow = api.LeaveApplication & { id: string; rejectedBy?: string; rejectedAt?: string; rejectionReason?: string };

type PersonData = { timesheets: TimesheetRow[]; leaves: LeaveRow[]; error?: string };

export function useTeamAttendance({
  managerId,
  managerName,
  role,
  isIncharge,
  selectedStoreId,
  stores,
}: {
  managerId: string;
  managerName: string;
  role: string;
  isIncharge: boolean;
  selectedStoreId?: string | null;
  stores: api.Store[];
}) {
  const isClusterHead = role === 'cluster_head';
  const [employees, setEmployees] = React.useState<api.Employee[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [byPerson, setByPerson] = React.useState<Record<string, PersonData>>({});
  const [loadingPeople, setLoadingPeople] = React.useState(false);
  const [escalated, setEscalated] = React.useState<LeaveRow[]>([]);
  // The owner and operations managers can decide anyone's leave (the server allows it), and
  // Home counts every waiting request: so they also see the ones waiting with an incharge
  // (owner, 28 Oct 2026: "Leave requests 2 waiting" opened to nothing).
  const seesAll = isClusterHead || (role === 'manager' && !isIncharge);
  const [othersPending, setOthersPending] = React.useState<LeaveRow[]>([]);
  const [staff, setStaff] = React.useState<api.Employee[]>([]);

  const loadEmployees = React.useCallback(async () => {
    setError(null);
    try {
      let data: api.Employee[];
      if (isClusterHead) data = await teamApi.getManagersByClusterHead(managerId);
      else if (isIncharge) data = await teamApi.getEmployeesByIncharge(managerId);
      else data = await teamApi.getEmployeesByManager(managerId);
      setEmployees(data || []);
    } catch (e) {
      console.error('Error loading employees:', e);
      setEmployees([]);
      setError(e instanceof Error ? e.message : 'Could not load your team');
    }
  }, [isClusterHead, isIncharge, managerId]);

  const loadEscalated = React.useCallback(async () => {
    if (!seesAll) return;
    try {
      const all = (await teamApi.getAllLeaves()) as LeaveRow[];
      const pending = all.filter((l) => l.status === 'pending');
      if (isClusterHead) setEscalated(pending.filter((l) => l.isAdvanceLeave && l.approverRole === 'cluster_head'));
      setOthersPending(pending);
    } catch (e) {
      console.error('Error loading escalated leaves:', e);
    }
  }, [isClusterHead, seesAll]);

  // Names for requests from people outside this login's own list (the owner's list is managers).
  React.useEffect(() => {
    if (!seesAll) return;
    teamApi.getEmployees().then((list: api.Employee[]) => setStaff(list || [])).catch(() => undefined);
  }, [seesAll]);

  React.useEffect(() => {
    if (!managerId) {
      setEmployees([]);
      return;
    }
    loadEmployees();
    loadEscalated();
  }, [managerId, loadEmployees, loadEscalated]);

  // Store filter (a store also matches its linked production house) and, for an incharge, only
  // the people whose incharge they are.
  const people = React.useMemo(() => {
    let list = employees || [];
    if (selectedStoreId) list = list.filter((e) => employeeBelongsToStore(e, selectedStoreId, stores));
    if (isIncharge && managerId) list = list.filter((e) => e.inchargeId === managerId);
    return list;
  }, [employees, selectedStoreId, stores, isIncharge, managerId]);

  const loadPerson = React.useCallback(async (employeeId: string) => {
    try {
      const [timesheets, leaves] = await Promise.all([teamApi.getTimesheets(employeeId), teamApi.getLeaves(employeeId)]);
      setByPerson((m) => ({ ...m, [employeeId]: { timesheets: timesheets as unknown as TimesheetRow[], leaves: leaves as LeaveRow[] } }));
    } catch (e) {
      console.error('Error loading attendance for', employeeId, e);
      setByPerson((m) => ({ ...m, [employeeId]: { timesheets: [], leaves: [], error: e instanceof Error ? e.message : 'Could not load' } }));
    }
  }, []);

  const peopleKey = people.map((p) => p.employeeId).join('|');
  React.useEffect(() => {
    if (!people.length) return;
    let cancelled = false;
    setLoadingPeople(true);
    Promise.all(people.map((p) => loadPerson(p.employeeId))).finally(() => {
      if (!cancelled) setLoadingPeople(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peopleKey, loadPerson]);

  const nameOf = (employeeId: string) => (employees || []).find((e) => e.employeeId === employeeId)?.name || staff.find((e) => e.employeeId === employeeId)?.name || employeeId;
  /** Whose queue a request waits in: the person's incharge, else their manager. */
  const waitsWith = (employeeId: string) => {
    const person = staff.find((e) => e.employeeId === employeeId) || (employees || []).find((e) => e.employeeId === employeeId);
    const approver = person?.inchargeId || person?.managerId;
    return approver ? nameOf(approver) : null;
  };
  const allTimesheets = people.flatMap((p) => byPerson[p.employeeId]?.timesheets || []);
  const allLeaves = people.flatMap((p) => byPerson[p.employeeId]?.leaves || []);
  const pendingTimesheets = allTimesheets.filter((t) => t.status === 'pending');
  const pendingLeaves = allLeaves.filter((l) => l.status === 'pending');

  const approveTimesheet = async (row: TimesheetRow) => {
    await teamApi.approveTimesheet(row.id, managerId);
    await loadPerson(row.employeeId);
  };
  const rejectTimesheet = async (row: TimesheetRow, reason: string) => {
    await teamApi.rejectTimesheet(row.id, managerId, reason);
    await loadPerson(row.employeeId);
  };
  const approveLeave = async (row: LeaveRow) => {
    await teamApi.approveLeave(row.id, managerId, managerName);
    await Promise.all([loadPerson(row.employeeId), loadEscalated()]);
  };
  const rejectLeave = async (row: LeaveRow, reason: string) => {
    await teamApi.rejectLeave(row.id, managerId, managerName, reason);
    await Promise.all([loadPerson(row.employeeId), loadEscalated()]);
  };

  return {
    loading: employees === null,
    loadingPeople: loadingPeople && Object.keys(byPerson).length === 0,
    error,
    reload: async () => {
      setByPerson({});
      await loadEmployees();
      await loadEscalated();
    },
    people,
    allEmployees: employees || [],
    byPerson,
    allTimesheets,
    allLeaves,
    nameOf,
    pendingTimesheets,
    pendingLeaves,
    escalated,
    othersPending,
    waitsWith,
    approveTimesheet,
    rejectTimesheet,
    approveLeave,
    rejectLeave,
  };
}

export type TeamAttendance = ReturnType<typeof useTeamAttendance>;
