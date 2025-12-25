import { useState, useEffect } from 'react';
import { Users, UserPlus, ChevronRight, Building2, UserCog, User, Network } from 'lucide-react';
import * as api from '../utils/api';

interface Employee {
  employeeId: string;
  name: string;
  email: string;
  role: 'cluster_head' | 'manager' | 'employee';
  joiningDate: string;
  managerId?: string;
  clusterHeadId?: string;
}

interface HierarchyNode {
  employeeId: string;
  name: string;
  email: string;
  role: string;
  joiningDate: string;
  managers?: HierarchyNode[];
  employees?: Employee[];
}

interface HierarchyManagementProps {
  userRole: 'cluster_head' | 'manager' | 'employee';
}

export function HierarchyManagement({ userRole }: HierarchyManagementProps) {
  const [hierarchy, setHierarchy] = useState<HierarchyNode[]>([]);
  const [unassignedManagers, setUnassignedManagers] = useState<Employee[]>([]);
  const [unassignedEmployees, setUnassignedEmployees] = useState<Employee[]>([]);
  const [stats, setStats] = useState({ totalClusterHeads: 0, totalManagers: 0, totalEmployees: 0 });
  const [loading, setLoading] = useState(false);
  const [showAssignClusterHead, setShowAssignClusterHead] = useState(false);
  const [showAssignManager, setShowAssignManager] = useState(false);
  const [selectedManager, setSelectedManager] = useState<Employee | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [clusterHeads, setClusterHeads] = useState<Employee[]>([]);
  const [managers, setManagers] = useState<Employee[]>([]);

  useEffect(() => {
    loadHierarchy();
  }, []);

  const loadHierarchy = async () => {
    try {
      setLoading(true);
      const data = await api.getOrganizationalHierarchy();
      setHierarchy(data.hierarchy || []);
      setUnassignedManagers(data.unassignedManagers || []);
      setUnassignedEmployees(data.unassignedEmployees || []);
      setStats(data.stats || { totalClusterHeads: 0, totalManagers: 0, totalEmployees: 0 });
      
      // Load cluster heads and managers for assignment dropdowns
      const allClusterHeads = await api.getAllClusterHeads();
      setClusterHeads(allClusterHeads);
      
      const allEmployees = await api.getAllEmployees();
      const allManagers = allEmployees.filter((emp: Employee) => emp.role === 'manager');
      setManagers(allManagers);
    } catch (error) {
      console.error('Error loading hierarchy:', error);
      alert('Failed to load organizational hierarchy');
    } finally {
      setLoading(false);
    }
  };

  const handleAssignClusterHead = async (managerId: string, clusterHeadId: string) => {
    try {
      await api.assignClusterHeadToManager(managerId, clusterHeadId);
      alert('Cluster head assigned successfully!');
      setShowAssignClusterHead(false);
      setSelectedManager(null);
      await loadHierarchy();
    } catch (error) {
      console.error('Error assigning cluster head:', error);
      alert('Failed to assign cluster head');
    }
  };

  const handleAssignManager = async (employeeId: string, managerId: string) => {
    try {
      await api.assignManagerToEmployee(employeeId, managerId);
      alert('Manager assigned successfully!');
      setShowAssignManager(false);
      setSelectedEmployee(null);
      await loadHierarchy();
    } catch (error) {
      console.error('Error assigning manager:', error);
      alert('Failed to assign manager');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50 p-6 flex items-center justify-center">
        <div className="text-gray-500">Loading hierarchy...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl text-gray-900 mb-2">Organizational Hierarchy</h1>
          <p className="text-gray-600">Manage reporting relationships across the organization</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg p-6 text-white">
            <div className="flex items-center justify-between">
              <Building2 className="w-12 h-12 opacity-80" />
              <div className="text-right">
                <div className="text-3xl">{stats.totalClusterHeads}</div>
                <div className="text-sm opacity-90">Cluster Heads</div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg p-6 text-white">
            <div className="flex items-center justify-between">
              <UserCog className="w-12 h-12 opacity-80" />
              <div className="text-right">
                <div className="text-3xl">{stats.totalManagers}</div>
                <div className="text-sm opacity-90">Managers</div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-pink-500 to-pink-600 rounded-xl shadow-lg p-6 text-white">
            <div className="flex items-center justify-between">
              <Users className="w-12 h-12 opacity-80" />
              <div className="text-right">
                <div className="text-3xl">{stats.totalEmployees}</div>
                <div className="text-sm opacity-90">Employees</div>
              </div>
            </div>
          </div>
        </div>

        {/* Hierarchy Tree */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl text-gray-900">Organizational Structure</h2>
            <Network className="w-6 h-6 text-purple-600" />
          </div>

          {hierarchy.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No hierarchy structure found. Create cluster heads to get started.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {hierarchy.map((clusterHead) => (
                <div key={clusterHead.employeeId} className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* Cluster Head */}
                  <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white">
                        <Building2 className="w-6 h-6" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg text-gray-900">{clusterHead.name}</h3>
                          <span className="px-2 py-1 bg-blue-600 text-white text-xs rounded">Cluster Head</span>
                        </div>
                        <div className="text-sm text-gray-600">{clusterHead.employeeId} • {clusterHead.email}</div>
                      </div>
                    </div>
                  </div>

                  {/* Managers under this Cluster Head */}
                  {clusterHead.managers && clusterHead.managers.length > 0 && (
                    <div className="p-4 bg-gray-50">
                      {clusterHead.managers.map((manager) => (
                        <div key={manager.employeeId} className="mb-4 last:mb-0 border border-gray-200 rounded-lg bg-white">
                          {/* Manager */}
                          <div className="bg-gradient-to-r from-purple-50 to-purple-100 p-4">
                            <div className="flex items-center gap-3">
                              <ChevronRight className="w-5 h-5 text-gray-400" />
                              <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center text-white">
                                <UserCog className="w-5 h-5" />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <h4 className="text-gray-900">{manager.name}</h4>
                                  <span className="px-2 py-1 bg-purple-600 text-white text-xs rounded">Manager</span>
                                </div>
                                <div className="text-sm text-gray-600">{manager.employeeId} • {manager.email}</div>
                              </div>
                            </div>
                          </div>

                          {/* Employees under this Manager */}
                          {manager.employees && manager.employees.length > 0 && (
                            <div className="p-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {manager.employees.map((employee) => (
                                  <div key={employee.employeeId} className="flex items-center gap-3 p-3 bg-pink-50 rounded-lg">
                                    <ChevronRight className="w-4 h-4 text-gray-400" />
                                    <div className="w-8 h-8 bg-pink-600 rounded-full flex items-center justify-center text-white text-sm">
                                      <User className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm text-gray-900 truncate">{employee.name}</div>
                                      <div className="text-xs text-gray-600 truncate">{employee.employeeId}</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Unassigned Section */}
        {(unassignedManagers.length > 0 || unassignedEmployees.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Unassigned Managers */}
            {unassignedManagers.length > 0 && (
              <div className="bg-white rounded-xl shadow-md p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg text-gray-900">Unassigned Managers</h3>
                  <span className="px-3 py-1 bg-orange-100 text-orange-700 text-sm rounded-full">
                    {unassignedManagers.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {unassignedManagers.map((manager) => (
                    <div key={manager.employeeId} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                            <UserCog className="w-5 h-5 text-purple-600" />
                          </div>
                          <div>
                            <div className="text-gray-900">{manager.name}</div>
                            <div className="text-sm text-gray-600">{manager.employeeId}</div>
                          </div>
                        </div>
                      </div>
                      {userRole === 'cluster_head' && (
                        <button
                          onClick={() => {
                            setSelectedManager(manager);
                            setShowAssignClusterHead(true);
                          }}
                          className="w-full px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm"
                        >
                          Assign Cluster Head
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Unassigned Employees */}
            {unassignedEmployees.length > 0 && (
              <div className="bg-white rounded-xl shadow-md p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg text-gray-900">Unassigned Employees</h3>
                  <span className="px-3 py-1 bg-orange-100 text-orange-700 text-sm rounded-full">
                    {unassignedEmployees.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {unassignedEmployees.map((employee) => (
                    <div key={employee.employeeId} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-pink-100 rounded-full flex items-center justify-center">
                            <User className="w-5 h-5 text-pink-600" />
                          </div>
                          <div>
                            <div className="text-gray-900">{employee.name}</div>
                            <div className="text-sm text-gray-600">{employee.employeeId}</div>
                          </div>
                        </div>
                      </div>
                      {(userRole === 'cluster_head' || userRole === 'manager') && (
                        <button
                          onClick={() => {
                            setSelectedEmployee(employee);
                            setShowAssignManager(true);
                          }}
                          className="w-full px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors text-sm"
                        >
                          Assign Manager
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Assign Cluster Head Modal */}
        {showAssignClusterHead && selectedManager && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
              <h3 className="text-xl text-gray-900 mb-4">Assign Cluster Head to Manager</h3>
              <p className="text-sm text-gray-600 mb-4">
                Manager: <strong>{selectedManager.name}</strong> ({selectedManager.employeeId})
              </p>
              
              <div className="mb-4">
                <label className="block text-sm text-gray-700 mb-2">Select Cluster Head</label>
                <select
                  id="clusterHeadSelect"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  defaultValue=""
                >
                  <option value="" disabled>Choose a cluster head...</option>
                  {clusterHeads.map((ch) => (
                    <option key={ch.employeeId} value={ch.employeeId}>
                      {ch.name} ({ch.employeeId})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    const select = document.getElementById('clusterHeadSelect') as HTMLSelectElement;
                    if (select.value) {
                      handleAssignClusterHead(selectedManager.employeeId, select.value);
                    } else {
                      alert('Please select a cluster head');
                    }
                  }}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:shadow-lg transition-all"
                >
                  Assign
                </button>
                <button
                  onClick={() => {
                    setShowAssignClusterHead(false);
                    setSelectedManager(null);
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Assign Manager Modal */}
        {showAssignManager && selectedEmployee && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
              <h3 className="text-xl text-gray-900 mb-4">Assign Manager to Employee</h3>
              <p className="text-sm text-gray-600 mb-4">
                Employee: <strong>{selectedEmployee.name}</strong> ({selectedEmployee.employeeId})
              </p>
              
              <div className="mb-4">
                <label className="block text-sm text-gray-700 mb-2">Select Manager</label>
                <select
                  id="managerSelect"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  defaultValue=""
                >
                  <option value="" disabled>Choose a manager...</option>
                  {managers.map((mgr) => (
                    <option key={mgr.employeeId} value={mgr.employeeId}>
                      {mgr.name} ({mgr.employeeId})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    const select = document.getElementById('managerSelect') as HTMLSelectElement;
                    if (select.value) {
                      handleAssignManager(selectedEmployee.employeeId, select.value);
                    } else {
                      alert('Please select a manager');
                    }
                  }}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-lg hover:shadow-lg transition-all"
                >
                  Assign
                </button>
                <button
                  onClick={() => {
                    setShowAssignManager(false);
                    setSelectedEmployee(null);
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
