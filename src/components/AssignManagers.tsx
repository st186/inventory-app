import { useState, useEffect } from 'react';
import { Users, CheckCircle, AlertCircle, Save, ArrowUpCircle, Edit, X } from 'lucide-react';
import * as api from '../utils/api';
import { EmployeeDetailsModal } from './EmployeeDetailsModal';

interface Employee {
  employeeId: string;
  name: string;
  email: string;
  role: string;
  managerId?: string;
  clusterHeadId?: string;
  designation?: string;
  department?: string;
  inchargeId?: string;
}

interface Manager {
  employeeId: string;
  name: string;
  email: string;
}

interface AssignManagersProps {
  clusterHeadId: string;
}

export function AssignManagers({ clusterHeadId }: AssignManagersProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [clusterHeads, setClusterHeads] = useState<Manager[]>([]); // Add cluster heads
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Fetch all employees
      const allEmployees = await api.getAllEmployees();
      
      console.log('All employees loaded:', allEmployees);
      console.log('Current cluster head ID:', clusterHeadId);
      
      // Filter employees AND managers (both can be assigned to managers for multi-level hierarchy)
      const employeesList = allEmployees.filter((emp: Employee) => 
        (emp.role === 'employee' || emp.role === 'manager') && emp.role !== 'cluster_head'
      );
      setEmployees(employeesList);
      
      console.log('Filtered employees and managers:', employeesList);
      
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
      
      console.log('Available managers (role=manager, clusterHeadId=' + clusterHeadId + '):', managersList);
      console.log('Available cluster heads:', clusterHeadsList);
      
      // Initialize assignments with current manager IDs
      const currentAssignments: Record<string, string> = {};
      employeesList.forEach((emp: Employee) => {
        if (emp.managerId) {
          currentAssignments[emp.employeeId] = emp.managerId;
        }
      });
      setAssignments(currentAssignments);
      
    } catch (error) {
      // Silently handle authentication errors (user not logged in yet)
      if (error instanceof Error && 
          (error.message === 'Not authenticated' || error.message === 'Unauthorized')) {
        return;
      }
      console.error('Error loading data:', error);
      alert('Failed to load data');
    } finally {
      setLoading(false);
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
        alert('Please select a manager');
        return;
      }

      await api.assignManagerToEmployee(employeeId, managerId);
      alert('Manager assigned successfully!');
      
      // Reload data to reflect changes
      await loadData();
      
    } catch (error) {
      console.error('Error assigning manager:', error);
      alert('Failed to assign manager');
    } finally {
      setSaving(null);
    }
  };

  const handlePromoteToManager = async (employeeId: string, employeeName: string) => {
    if (!confirm(`Are you sure you want to promote ${employeeName} to Manager? This will:\n\n1. Change their role from Employee to Manager\n2. Set their cluster head to ${clusterHeadId}\n3. Allow them to manage other employees\n\nContinue?`)) {
      return;
    }

    try {
      setEditingRole(employeeId);
      
      // Update the employee to be a manager
      await api.updateUnifiedEmployee(employeeId, {
        role: 'manager',
        clusterHeadId: clusterHeadId
      });
      
      alert(`${employeeName} has been promoted to Manager!`);
      
      // Reload data to reflect changes
      await loadData();
      
    } catch (error) {
      console.error('Error promoting to manager:', error);
      alert('Failed to promote employee to manager');
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

  // Format designation for display
  const formatDesignation = (designation?: string) => {
    if (!designation) return <span className="text-gray-400 italic">No designation</span>;
    
    const designationMap: Record<string, string> = {
      'operations_incharge': 'Operations Incharge',
      'store_incharge': 'Store Incharge',
      'production_incharge': 'Production Incharge',
      'store_ops': 'Store Operations',
      'production_ops': 'Production Operations',
    };
    
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
        {designationMap[designation] || designation}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
          Assign Managers to Employees
        </h1>
        <p className="text-gray-600 mt-2">
          Manage employee-manager relationships across your organization
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Employees</p>
              <p className="text-2xl font-bold text-gray-900">{employees.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Assigned</p>
              <p className="text-2xl font-bold text-gray-900">{assignedEmployees.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Unassigned</p>
              <p className="text-2xl font-bold text-gray-900">{unassignedEmployees.length}</p>
            </div>
          </div>
        </div>
      </div>

      {managers.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center">
          <AlertCircle className="w-12 h-12 text-yellow-600 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-yellow-900 mb-2">No Managers Available</h3>
          <p className="text-yellow-700">
            You need to create managers first before assigning them to employees.
          </p>
        </div>
      ) : (
        <>
          {/* Unassigned Employees Section */}
          {unassignedEmployees.length > 0 && (
            <div className="mb-8">
              <div className="bg-red-50 border border-red-200 rounded-t-xl px-6 py-4">
                <h2 className="text-lg font-semibold text-red-900 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  Unassigned Employees ({unassignedEmployees.length})
                </h2>
                <p className="text-sm text-red-700 mt-1">
                  These employees need to be assigned to a manager
                </p>
              </div>
              <div className="bg-white rounded-b-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Employee
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Employee ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Designation
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Assign Manager
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {unassignedEmployees.map((employee) => (
                      <tr key={employee.employeeId} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{employee.name}</div>
                            <div className="text-sm text-gray-500">{employee.email}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                              {employee.employeeId}
                            </span>
                            {employee.role === 'employee' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                Employee
                              </span>
                            )}
                            {employee.role === 'manager' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                Manager
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {formatDesignation(employee.designation)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <select
                            value={assignments[employee.employeeId] || ''}
                            onChange={(e) => handleAssignmentChange(employee.employeeId, e.target.value)}
                            className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                          >
                            <option value="">Select a manager...</option>
                            {getAvailableSupervisors(employee).map((manager) => (
                              <option key={manager.employeeId} value={manager.employeeId}>
                                {manager.name} ({manager.employeeId})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleSave(employee.employeeId)}
                              disabled={!assignments[employee.employeeId] || saving === employee.employeeId}
                              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm"
                            >
                              <Save className="w-4 h-4" />
                              {saving === employee.employeeId ? 'Saving...' : 'Assign'}
                            </button>
                            {employee.role === 'employee' && (
                              <button
                                onClick={() => handlePromoteToManager(employee.employeeId, employee.name)}
                                disabled={editingRole === employee.employeeId}
                                className="inline-flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg hover:from-amber-600 hover:to-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm"
                              >
                                <ArrowUpCircle className="w-4 h-4" />
                                {editingRole === employee.employeeId ? 'Promoting...' : 'Promote'}
                              </button>
                            )}
                            <button
                              onClick={() => setSelectedEmployee(employee)}
                              className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                            >
                              <Edit className="w-4 h-4" />
                              Edit
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Assigned Employees Section */}
          {assignedEmployees.length > 0 && (
            <div>
              <div className="bg-green-50 border border-green-200 rounded-t-xl px-6 py-4">
                <h2 className="text-lg font-semibold text-green-900 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  Assigned Employees ({assignedEmployees.length})
                </h2>
                <p className="text-sm text-green-700 mt-1">
                  These employees are already assigned to managers
                </p>
              </div>
              <div className="bg-white rounded-b-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Employee
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Employee ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Designation
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Current Manager
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Reassign Manager
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {assignedEmployees.map((employee) => (
                      <tr key={employee.employeeId} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{employee.name}</div>
                            <div className="text-sm text-gray-500">{employee.email}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                              {employee.employeeId}
                            </span>
                            {employee.role === 'employee' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                Employee
                              </span>
                            )}
                            {employee.role === 'manager' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                Manager
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {formatDesignation(employee.designation)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{getManagerName(employee.managerId)}</div>
                          {employee.managerId && (
                            <div className="text-xs text-gray-500">{employee.managerId}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <select
                            value={assignments[employee.employeeId] || employee.managerId || ''}
                            onChange={(e) => handleAssignmentChange(employee.employeeId, e.target.value)}
                            className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                          >
                            <option value="">Select a manager...</option>
                            {getAvailableSupervisors(employee).map((manager) => (
                              <option key={manager.employeeId} value={manager.employeeId}>
                                {manager.name} ({manager.employeeId})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleSave(employee.employeeId)}
                              disabled={
                                !assignments[employee.employeeId] || 
                                assignments[employee.employeeId] === employee.managerId ||
                                saving === employee.employeeId
                              }
                              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm"
                            >
                              <Save className="w-4 h-4" />
                              {saving === employee.employeeId ? 'Saving...' : 'Update'}
                            </button>
                            {employee.role === 'employee' && (
                              <button
                                onClick={() => handlePromoteToManager(employee.employeeId, employee.name)}
                                disabled={editingRole === employee.employeeId}
                                className="inline-flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg hover:from-amber-600 hover:to-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm"
                              >
                                <ArrowUpCircle className="w-4 h-4" />
                                {editingRole === employee.employeeId ? 'Promoting...' : 'Promote'}
                              </button>
                            )}
                            <button
                              onClick={() => setSelectedEmployee(employee)}
                              className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                            >
                              <Edit className="w-4 h-4" />
                              Edit
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {employees.length === 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-12 text-center">
              <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Employees Found</h3>
              <p className="text-gray-600">
                There are no employees in the system yet. Create employees first through the Employee Management tab.
              </p>
            </div>
          )}
        </>
      )}
      
      {/* Employee Details Modal */}
      {selectedEmployee && (
        <EmployeeDetailsModal
          employee={selectedEmployee}
          onClose={() => setSelectedEmployee(null)}
          onSave={loadData}
          clusterHeadId={clusterHeadId}
        />
      )}
    </div>
  );
}