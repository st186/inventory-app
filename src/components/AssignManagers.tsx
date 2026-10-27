import { useState, useEffect } from 'react';
import { ArrowUpCircle, Pencil, Users } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '../utils/api';
import { EmployeeDetailsModal } from './EmployeeDetailsModal';
import { formatDesignation, TreeRow } from './ManagerCard';
import { Button } from './ui/button';
import { Field } from './ui/field';
import { NativeSelect } from './ui/select';
import { ListGroup } from './ui/list-row';
import { StatSplit } from './ui/stat-tile';
import { StatusChip } from './ui/status-chip';
import { Callout } from './ui/callout';
import { EmptyState } from './ui/empty-state';
import { ErrorState } from './ui/error-state';
import { ResponsiveModal } from './ui/responsive-modal';
import { confirm } from './ui/confirm';
import { SetupPage, LoadingList } from './setup/SetupPage';

type Employee = api.Employee;

interface Manager {
  employeeId: string;
  name: string;
  email: string;
}

interface AssignManagersProps {
  clusterHeadId: string;
  /** Inside another page that already has the page padding (Who reports to whom). */
  embedded?: boolean;
}

// Who each employee and manager reports to (owner): a list per state, and a sheet per person to
// change their manager, promote them to manager or open their details.
export function AssignManagers({ clusterHeadId, embedded = false }: AssignManagersProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [clusterHeads, setClusterHeads] = useState<Manager[]>([]); // Add cluster heads
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [person, setPerson] = useState<Employee | null>(null);
  const [personOpen, setPersonOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // Fetch all employees
      const allEmployees = await api.getAllEmployees();

      // Filter employees AND managers (both can be assigned to managers for multi-level hierarchy)
      const employeesList = allEmployees.filter((emp: Employee) =>
        emp.role === 'employee' || emp.role === 'manager'
      );
      setEmployees(employeesList);

      // Get all managers under this cluster head (they can be assigned to other employees/managers)
      const managersList = allEmployees.filter(
        (emp: Employee) => emp.role === 'manager' && emp.clusterHeadId === clusterHeadId
      );
      setManagers(managersList);

      // Get cluster heads (for manager assignment)
      const clusterHeadsList = allEmployees.filter(
        (emp: Employee) => emp.role === 'cluster_head'
      );
      setClusterHeads(clusterHeadsList);

      // Initialize assignments with current manager IDs
      const currentAssignments: Record<string, string> = {};
      employeesList.forEach((emp: Employee) => {
        if (emp.managerId) {
          currentAssignments[emp.employeeId] = emp.managerId;
        }
      });
      setAssignments(currentAssignments);
      setLoadError(null);
    } catch (error) {
      // Silently handle authentication errors (user not logged in yet)
      if (error instanceof Error &&
          (error.message === 'Not authenticated' || error.message === 'Unauthorized')) {
        return;
      }
      console.error('Error loading data:', error);
      setLoadError(error instanceof Error ? error.message : 'Failed to load data');
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  };

  const handleAssignmentChange = (employeeId: string, managerId: string) => {
    setAssignments(prev => ({
      ...prev,
      [employeeId]: managerId
    }));
  };

  const handleSave = async (employeeId: string) => {
    try {
      setSaving(employeeId);
      const managerId = assignments[employeeId];

      if (!managerId) {
        toast.error('Choose a manager');
        return;
      }

      await api.assignManagerToEmployee(employeeId, managerId);
      toast.success('Manager assigned');
      setPersonOpen(false);

      // Reload data to reflect changes
      await loadData();

    } catch (error) {
      console.error('Error assigning manager:', error);
      toast.error('Failed to assign manager');
    } finally {
      setSaving(null);
    }
  };

  const handlePromoteToManager = async (employeeId: string, employeeName: string) => {
    const ok = await confirm({
      title: `Promote ${employeeName} to manager?`,
      body: `Their role changes from employee to manager, their cluster head becomes ${clusterHeadId}, and they can manage other people.`,
      confirmLabel: 'Promote to manager',
      tone: 'primary',
    });
    if (!ok) return;

    try {
      setEditingRole(employeeId);

      // Update the employee to be a manager
      await api.updateUnifiedEmployee(employeeId, {
        role: 'manager',
        clusterHeadId: clusterHeadId
      });

      toast.success(`${employeeName} is now a manager`);
      setPersonOpen(false);

      // Reload data to reflect changes
      await loadData();

    } catch (error) {
      console.error('Error promoting to manager:', error);
      toast.error('Failed to promote employee to manager');
    } finally {
      setEditingRole(null);
    }
  };

  const unassignedEmployees = employees.filter(emp => !emp.managerId);
  const assignedEmployees = employees.filter(emp => emp.managerId);

  const getManagerName = (managerId?: string) => {
    if (!managerId) return 'Unassigned';
    // Check if it's a manager first
    const manager = managers.find(m => m.employeeId === managerId);
    if (manager) return manager.name;
    // Check if it's a cluster head
    const clusterHead = clusterHeads.find(ch => ch.employeeId === managerId);
    if (clusterHead) return `${clusterHead.name} (Cluster Head)`;
    return 'Unknown Manager';
  };

  // Get available supervisors for a given employee (managers can be assigned to cluster heads or other managers)
  const getAvailableSupervisors = (employee: Employee) => {
    const supervisors: Manager[] = [];

    if (employee.role === 'manager') {
      // Managers can be assigned to cluster heads OR other managers (Operations Head)
      // Add cluster heads
      supervisors.push(...clusterHeads);
      // Add other managers (for multi-level like Store Incharge under Operations Head)
      supervisors.push(...managers.filter(m => m.employeeId !== employee.employeeId));
    } else {
      // Regular employees can only be assigned to managers
      supervisors.push(...managers.filter(m => m.employeeId !== employee.employeeId));
    }

    return supervisors;
  };

  const openPerson = (employee: Employee) => {
    setPerson(employee);
    setPersonOpen(true);
  };

  const meta = (employee: Employee) => [
    employee.designation ? formatDesignation(employee.designation) : employee.role === 'manager' ? 'Manager' : 'Employee',
    employee.employeeId,
  ].join(' · ');

  const chosen = person ? (assignments[person.employeeId] || person.managerId || '') : '';
  const changed = !!person && !!assignments[person.employeeId] && assignments[person.employeeId] !== person.managerId;

  let body;
  if (!loaded) {
    body = <LoadingList leading="avatar" rows={6} withTile />;
  } else if (loadError) {
    body = <ErrorState body={loadError} onRetry={loadData} retrying={loading} />;
  } else {
    body = (
      <>
        <div className="rounded-lg border border-border bg-surface p-4">
          <StatSplit items={[
            { label: 'People', value: employees.length },
            { label: 'Assigned', value: assignedEmployees.length },
            { label: 'Not assigned', value: <span className={unassignedEmployees.length ? 'text-warning' : undefined}>{unassignedEmployees.length}</span> },
          ]} />
        </div>

        {managers.length === 0 ? (
          <Callout tone="warning" title="No managers yet">Make someone a manager first, then assign people to them.</Callout>
        ) : employees.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface">
            <EmptyState icon={Users} title="No employees yet" body="Add people in Team > People first." />
          </div>
        ) : (
          <>
            {unassignedEmployees.length > 0 && (
              <ListGroup title="Not assigned yet" meta={String(unassignedEmployees.length)}>
                {unassignedEmployees.map((employee) => (
                  <TreeRow key={employee.employeeId} depth={0} name={employee.name} meta={meta(employee)} trailing={<StatusChip tone="warning">No manager</StatusChip>} onClick={() => openPerson(employee)} />
                ))}
              </ListGroup>
            )}
            {assignedEmployees.length > 0 && (
              <ListGroup title="Assigned" meta={String(assignedEmployees.length)}>
                {assignedEmployees.map((employee) => (
                  <TreeRow key={employee.employeeId} depth={0} name={employee.name} meta={`${meta(employee)} · reports to ${getManagerName(employee.managerId)}`} onClick={() => openPerson(employee)} />
                ))}
              </ListGroup>
            )}
          </>
        )}
      </>
    );
  }

  const content = (
    <>
      {body}

      <ResponsiveModal
        open={personOpen}
        onOpenChange={setPersonOpen}
        onClosed={() => setPerson(null)}
        title={person?.name || ''}
        description={person ? `${meta(person)}${person.email ? ` · ${person.email}` : ''}` : undefined}
        dirty={changed && !saving}
        footer={person ? (
          <Button size="lg" className="flex-1" loading={saving === person.employeeId} disabled={!assignments[person.employeeId] || assignments[person.employeeId] === person.managerId} onClick={() => handleSave(person.employeeId)}>
            {person.managerId ? 'Save manager' : 'Assign'}
          </Button>
        ) : undefined}
      >
        {person && (
          <div className="flex flex-col gap-5">
            <Field label="Reports to" helper={person.managerId ? `Now: ${getManagerName(person.managerId)} (${person.managerId})` : undefined}>
              <NativeSelect value={chosen} onChange={(e) => handleAssignmentChange(person.employeeId, e.target.value)}>
                <option value="">Choose a manager</option>
                {getAvailableSupervisors(person).map((manager) => (
                  <option key={manager.employeeId} value={manager.employeeId}>
                    {manager.name} ({manager.employeeId})
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              {person.role === 'employee' && (
                <Button variant="secondary" leadingIcon={<ArrowUpCircle />} loading={editingRole === person.employeeId} onClick={() => handlePromoteToManager(person.employeeId, person.name)}>
                  Promote to manager
                </Button>
              )}
              <Button
                variant="secondary"
                leadingIcon={<Pencil />}
                onClick={() => {
                  // Close this sheet first: the details editor is a window of its own.
                  const who = person;
                  setPersonOpen(false);
                  window.setTimeout(() => setSelectedEmployee(who), 200);
                }}
              >
                Edit details
              </Button>
            </div>
          </div>
        )}
      </ResponsiveModal>

      {/* Employee Details Modal */}
      {selectedEmployee && (
        <EmployeeDetailsModal
          employee={selectedEmployee}
          onClose={() => setSelectedEmployee(null)}
          onSave={loadData}
          clusterHeadId={clusterHeadId}
        />
      )}
    </>
  );

  if (embedded) return <>{content}</>;
  return <SetupPage>{content}</SetupPage>;
}
