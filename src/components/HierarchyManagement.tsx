import { useState, useEffect } from 'react';
import { Network } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '../utils/api';
import { peekStoredSession } from '../utils/accessToken';
import { ManagerCard, TreeRow, formatDesignation } from './ManagerCard';
import { AssignManagers } from './AssignManagers';
import { Button } from './ui/button';
import { Field } from './ui/field';
import { NativeSelect } from './ui/select';
import { ListGroup } from './ui/list-row';
import { StatSplit } from './ui/stat-tile';
import { StatusChip } from './ui/status-chip';
import { SegmentedControl } from './ui/segmented-control';
import { EmptyState } from './ui/empty-state';
import { ErrorState } from './ui/error-state';
import { ResponsiveModal } from './ui/responsive-modal';
import { SetupPage, LoadingList } from './setup/SetupPage';

type Employee = api.Employee;

interface InchargeNode extends Employee {
  employees?: Employee[];
}

interface ManagerNode extends Employee {
  employees?: Employee[];
  managers?: ManagerNode[]; // Add support for nested managers
  incharges?: InchargeNode[];
}

interface HierarchyNode {
  employeeId: string;
  name: string;
  email: string;
  role: string;
  joiningDate: string;
  managers?: ManagerNode[];
  employees?: Employee[];
}

interface HierarchyManagementProps {
  userRole: 'cluster_head' | 'manager' | 'employee';
  selectedStoreId?: string | null;
  accessToken?: string;
  /** The owner's own employee id, for "Assign managers". Found from the signed-in email when left out. */
  currentEmployeeId?: string | null;
  /** Inside another page that already has the page padding (Employees). */
  embedded?: boolean;
}

// Setup > Who reports to whom: the organisation tree, and (owner) assigning managers - one screen
// for what used to be the Hierarchy and Assign managers tabs.
export function HierarchyManagement({ userRole, selectedStoreId, accessToken, currentEmployeeId, embedded = false }: HierarchyManagementProps) {
  const [hierarchy, setHierarchy] = useState<HierarchyNode[]>([]);
  const [unassignedManagers, setUnassignedManagers] = useState<Employee[]>([]);
  const [unassignedEmployees, setUnassignedEmployees] = useState<Employee[]>([]);
  const [stats, setStats] = useState({ totalClusterHeads: 0, totalManagers: 0, totalEmployees: 0 });
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedManager, setSelectedManager] = useState<Employee | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [choice, setChoice] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [clusterHeads, setClusterHeads] = useState<Employee[]>([]);
  const [managers, setManagers] = useState<Employee[]>([]);
  const [ownerId, setOwnerId] = useState<string | null>(currentEmployeeId || null);
  const [view, setView] = useState<'structure' | 'assign'>('structure');

  useEffect(() => {
    loadHierarchy();
  }, [selectedStoreId]); // Reload when store changes

  const loadHierarchy = async () => {
    if (!accessToken) {
      console.error('No access token available');
      setLoaded(true);
      return;
    }

    try {
      setLoading(true);
      const data = await api.getOrganizationalHierarchy(selectedStoreId);

      setHierarchy((data.hierarchy as any) || []);
      setUnassignedManagers(data.unassignedManagers || []);
      setUnassignedEmployees(data.unassignedEmployees || []);
      setStats(data.stats || { totalClusterHeads: 0, totalManagers: 0, totalEmployees: 0 });

      // Only load cluster heads if user has permission (cluster heads only)
      if (userRole === 'cluster_head') {
        try {
          const allClusterHeads = await api.getAllClusterHeads(accessToken);
          setClusterHeads(allClusterHeads);
        } catch (error) {
          console.log('User not authorized to view all cluster heads');
        }
      }

      const allEmployees = await api.getAllEmployees();
      const allManagers = allEmployees.filter((emp: Employee) => emp.role === 'manager');
      setManagers(allManagers);
      if (!currentEmployeeId && userRole === 'cluster_head') {
        const email = peekStoredSession()?.user?.email?.toLowerCase();
        const me = allEmployees.find((emp: Employee) => emp.role === 'cluster_head' && !!email && emp.email?.toLowerCase() === email);
        setOwnerId(me?.employeeId || null);
      }
      setLoadError(null);
    } catch (error) {
      console.error('Error loading hierarchy:', error);
      // Don't show an error for auth errors, just log them
      if (error instanceof Error && !error.message.includes('JWT') && !error.message.includes('Unauthorized')) {
        setLoadError(error.message || 'Failed to load organizational hierarchy');
      }
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  };

  const openClusterHeadSheet = (manager: Employee) => {
    setSelectedEmployee(null);
    setSelectedManager(manager);
    setChoice('');
    setSheetOpen(true);
  };

  const openManagerSheet = (employee: Employee) => {
    setSelectedManager(null);
    setSelectedEmployee(employee);
    setChoice('');
    setSheetOpen(true);
  };

  const handleAssignClusterHead = async (managerId: string, clusterHeadId: string) => {
    try {
      setAssigning(true);
      await api.assignClusterHeadToManager(managerId, clusterHeadId);
      toast.success('Cluster head assigned');
      setSheetOpen(false);
      await loadHierarchy();
    } catch (error) {
      console.error('Error assigning cluster head:', error);
      toast.error('Failed to assign cluster head');
    } finally {
      setAssigning(false);
    }
  };

  const handleAssignManager = async (employeeId: string, managerId: string) => {
    try {
      setAssigning(true);
      await api.assignManagerToEmployee(employeeId, managerId);
      toast.success('Manager assigned');
      setSheetOpen(false);
      await loadHierarchy();
    } catch (error) {
      console.error('Error assigning manager:', error);
      toast.error('Failed to assign manager');
    } finally {
      setAssigning(false);
    }
  };

  const assign = () => {
    if (!choice) {
      toast.error(selectedManager ? 'Choose a cluster head' : 'Choose a manager');
      return;
    }
    if (selectedManager) handleAssignClusterHead(selectedManager.employeeId, choice);
    else if (selectedEmployee) handleAssignManager(selectedEmployee.employeeId, choice);
  };

  const teamManagers = unassignedManagers.filter((m: any) => (m.employees && m.employees.length > 0) || (m.incharges && m.incharges.length > 0));
  const nobody = hierarchy.length === 0 && unassignedManagers.length === 0 && unassignedEmployees.length === 0;

  const structure = !loaded ? (
    <LoadingList leading="avatar" rows={6} />
  ) : loadError ? (
    <ErrorState title="Couldn't load who reports to whom" body={loadError} onRetry={loadHierarchy} retrying={loading} />
  ) : (
    <>
      <div className="rounded-lg border border-border bg-surface p-4">
        <StatSplit items={[
          { label: 'Cluster heads', value: stats.totalClusterHeads },
          { label: 'Managers', value: stats.totalManagers },
          { label: 'Employees', value: stats.totalEmployees },
        ]} />
      </div>

      {nobody ? (
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState icon={Network} title="Nobody here yet" body="Add people in Team > People first." />
        </div>
      ) : (
        <>
          {/* Cluster head trees */}
          {hierarchy.map((clusterHead) => (
            <ListGroup key={clusterHead.employeeId} title={clusterHead.name} meta="Cluster head">
              {(clusterHead.managers || []).length === 0 && (clusterHead.employees || []).length === 0 && (
                <p className="px-4 py-3 text-body-sm text-text-2">Nobody reports to {clusterHead.name} yet.</p>
              )}
              {clusterHead.managers?.map((manager) => (
                <ManagerCard key={manager.employeeId} manager={manager} />
              ))}
              {clusterHead.employees?.map((employee) => (
                <TreeRow key={employee.employeeId} depth={0} name={employee.name} meta={employee.employeeId} />
              ))}
            </ListGroup>
          ))}

          {/* Managers without a cluster head who lead a team */}
          {teamManagers.length > 0 && (
            <ListGroup title="Managers and their teams">
              {teamManagers.map((manager: any) => (
                <div key={manager.employeeId} className="[&>*+*]:border-t [&>*+*]:border-border">
                  <TreeRow depth={0} name={manager.name} meta={`Manager · ${manager.employeeId}`} />
                  {(manager.incharges || []).map((incharge: InchargeNode) => (
                    <div key={incharge.employeeId} className="[&>*+*]:border-t [&>*+*]:border-border">
                      <TreeRow
                        depth={1}
                        name={incharge.name}
                        meta={incharge.employeeId}
                        trailing={<StatusChip tone="info">{incharge.designation === 'store_incharge' ? 'Store incharge' : 'Production incharge'}</StatusChip>}
                      />
                      {(incharge.employees || []).map((employee: Employee) => (
                        <TreeRow key={employee.employeeId} depth={2} name={employee.name} meta={employee.employeeId} />
                      ))}
                    </div>
                  ))}
                  {(manager.employees || []).map((employee: Employee) => (
                    <TreeRow key={employee.employeeId} depth={1} name={employee.name} meta={`Direct report · ${employee.employeeId}`} />
                  ))}
                </div>
              ))}
            </ListGroup>
          )}

          {/* Not placed yet */}
          {unassignedManagers.length > 0 && (
            <ListGroup title="Managers without a cluster head" meta={String(unassignedManagers.length)} footer={userRole === 'cluster_head' ? 'Tap a manager to choose their cluster head.' : undefined}>
              {unassignedManagers.map((manager) => (
                <TreeRow
                  key={manager.employeeId}
                  depth={0}
                  name={manager.name}
                  meta={`${formatDesignation(manager.designation)} · ${manager.employeeId}`}
                  trailing={<StatusChip tone="warning">Not placed</StatusChip>}
                  onClick={userRole === 'cluster_head' ? () => openClusterHeadSheet(manager) : undefined}
                />
              ))}
            </ListGroup>
          )}

          {unassignedEmployees.length > 0 && (
            <ListGroup title="Staff without a manager" meta={String(unassignedEmployees.length)} footer={userRole === 'cluster_head' || userRole === 'manager' ? 'Tap someone to choose their manager.' : undefined}>
              {unassignedEmployees.map((employee) => (
                <TreeRow
                  key={employee.employeeId}
                  depth={0}
                  name={employee.name}
                  meta={`${formatDesignation(employee.designation, 'Employee')} · ${employee.employeeId}`}
                  trailing={<StatusChip tone="warning">No manager</StatusChip>}
                  onClick={userRole === 'cluster_head' || userRole === 'manager' ? () => openManagerSheet(employee) : undefined}
                />
              ))}
            </ListGroup>
          )}
        </>
      )}
    </>
  );

  const canAssignManagers = userRole === 'cluster_head' && !!ownerId;
  const content = (
    <>
      {canAssignManagers && (
        <SegmentedControl
          aria-label="Who reports to whom"
          value={view}
          onValueChange={setView}
          options={[{ value: 'structure', label: 'Structure' }, { value: 'assign', label: 'Assign managers' }]}
        />
      )}
      {view === 'assign' && canAssignManagers ? <AssignManagers clusterHeadId={ownerId!} embedded /> : structure}

      <ResponsiveModal
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onClosed={() => { setSelectedManager(null); setSelectedEmployee(null); }}
        title={selectedManager ? 'Choose a cluster head' : 'Choose a manager'}
        description={selectedManager ? `${selectedManager.name} (${selectedManager.employeeId})` : selectedEmployee ? `${selectedEmployee.name} (${selectedEmployee.employeeId})` : undefined}
        dirty={!!choice && !assigning}
        footer={<Button size="lg" className="flex-1" loading={assigning} disabled={!choice} onClick={assign}>Assign</Button>}
      >
        {selectedManager ? (
          <Field label="Cluster head">
            <NativeSelect value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="">Choose a cluster head</option>
              {clusterHeads.map((ch) => (
                <option key={ch.employeeId} value={ch.employeeId}>{ch.name} ({ch.employeeId})</option>
              ))}
            </NativeSelect>
          </Field>
        ) : (
          <Field label="Manager">
            <NativeSelect value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="">Choose a manager</option>
              {managers.map((mgr) => (
                <option key={mgr.employeeId} value={mgr.employeeId}>{mgr.name} ({mgr.employeeId})</option>
              ))}
            </NativeSelect>
          </Field>
        )}
      </ResponsiveModal>
    </>
  );

  if (embedded) return <div className="flex flex-col gap-5">{content}</div>;
  return <SetupPage>{content}</SetupPage>;
}
