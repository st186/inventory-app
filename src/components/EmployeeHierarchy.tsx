import { useState, useEffect } from 'react';
import { Users } from 'lucide-react';
import * as api from '../utils/api';
import { ListGroup } from './ui/list-row';
import { StatTile, StatGrid } from './ui/stat-tile';
import { StatusChip } from './ui/status-chip';
import { EmptyState } from './ui/empty-state';
import { SetupPage, LoadingList } from './setup/SetupPage';
import { TreeRow } from './ManagerCard';

interface EmployeeHierarchyProps {
  managerId: string;
  role: 'manager' | 'cluster_head';
}

// A manager's team (or the owner's managers) with what is waiting on each person.
export function EmployeeHierarchy({ managerId, role }: EmployeeHierarchyProps) {
  const [employees, setEmployees] = useState<any[]>([]);
  const [managers, setManagers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      if (role === 'manager') {
        const empData = await api.getEmployeesByManager(managerId);
        setEmployees(empData);

        // Load stats for each employee
        const statsData: any = {};
        for (const emp of empData) {
          const [timesheets, leaves] = await Promise.all([
            api.getTimesheets(emp.employeeId),
            api.getLeaves(emp.employeeId)
          ]);

          statsData[emp.employeeId] = {
            pendingTimesheets: timesheets.filter((t: any) => t.status === 'pending').length,
            pendingLeaves: leaves.filter((l: any) => l.status === 'pending').length,
            approvedTimesheets: timesheets.filter((t: any) => t.status === 'approved').length,
            totalLeaves: leaves.filter((l: any) => l.status === 'approved').length
          };
        }
        setStats(statsData);
      } else {
        // Cluster head - load managers
        const mgrData = await api.getManagersByClusterHead(managerId);
        setManagers(mgrData);

        // Load stats for each manager
        const statsData: any = {};
        for (const mgr of mgrData) {
          const employees = await api.getEmployeesByManager(mgr.employeeId);
          statsData[mgr.employeeId] = {
            employeeCount: employees.length,
            ...(mgr as any).stats
          };
        }
        setStats(statsData);
      }
    } catch (error) {
      // Silently handle authentication errors (user not logged in yet)
      if (error instanceof Error &&
          (error.message === 'Not authenticated' || error.message === 'Unauthorized')) {
        return;
      }
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const people = role === 'manager' ? employees : managers;
  const pendingTimesheets = Object.values(stats).reduce((sum: number, s: any) => sum + (s.pendingTimesheets || 0), 0) as number;
  const pendingLeaves = Object.values(stats).reduce((sum: number, s: any) => sum + (s.pendingLeaves || 0), 0) as number;

  return (
    <SetupPage>
      {loading ? (
        <LoadingList leading="avatar" rows={5} withTile />
      ) : (
        <>
          <StatGrid columns={3}>
            <StatTile label={role === 'manager' ? 'People in your team' : 'Managers'} value={people.length} />
            <StatTile label="Timesheets waiting" value={pendingTimesheets} />
            <StatTile label="Leave waiting" value={pendingLeaves} />
          </StatGrid>

          <ListGroup
            title={role === 'manager' ? 'Your team' : 'Your managers'}
            empty={<EmptyState compact icon={Users} title={role === 'manager' ? 'No employees found' : 'No managers found'} />}
          >
            {people.map((person) => {
              const s = stats[person.employeeId];
              const joined = person.joiningDate ? new Date(person.joiningDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A';
              const detail = role === 'manager'
                ? (s ? `${s.approvedTimesheets} timesheets approved · ${s.totalLeaves} leave days approved` : '')
                : (s ? `${s.employeeCount} employee${s.employeeCount === 1 ? '' : 's'}` : '');
              return (
                <TreeRow
                  key={person.employeeId}
                  depth={0}
                  name={person.name}
                  meta={[person.employeeId, `Joined ${joined}`, detail].filter(Boolean).join(' · ')}
                  trailing={role === 'manager' && s && (s.pendingTimesheets > 0 || s.pendingLeaves > 0) ? (
                    <StatusChip tone="warning">{s.pendingTimesheets + s.pendingLeaves} waiting</StatusChip>
                  ) : undefined}
                />
              );
            })}
          </ListGroup>
        </>
      )}
    </SetupPage>
  );
}
