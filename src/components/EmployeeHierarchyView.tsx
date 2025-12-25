import { useState, useEffect } from 'react';
import { Users, Building2 } from 'lucide-react';
import * as api from '../utils/api';

interface Employee {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  role: 'manager' | 'employee' | 'cluster_head';
  managerId?: string;
  clusterHeadId?: string;
}

interface HierarchyNode {
  employee: Employee;
  subordinates: HierarchyNode[];
}

interface EmployeeHierarchyViewProps {
  currentUser: {
    employeeId: string;
    role: string;
    email: string;
    name: string;
  };
}

export function EmployeeHierarchyView({ currentUser }: EmployeeHierarchyViewProps) {
  const [hierarchy, setHierarchy] = useState<{
    clusterHead: Employee | null;
    managers: Employee[];
    employees: Employee[];
  }>({
    clusterHead: null,
    managers: [],
    employees: []
  });
  const [loading, setLoading] = useState(true);
  const [myManager, setMyManager] = useState<Employee | null>(null);
  const [myClusterHead, setMyClusterHead] = useState<Employee | null>(null);

  useEffect(() => {
    loadHierarchy();
  }, []);

  const loadHierarchy = async () => {
    try {
      setLoading(true);
      const allEmployees = await api.getAllEmployees();

      // Find current user's full record
      const currentUserRecord = allEmployees.find(
        (emp: Employee) => emp.employeeId === currentUser.employeeId
      );

      if (!currentUserRecord) {
        setLoading(false);
        return;
      }

      // Based on user role, build hierarchy
      if (currentUser.role === 'employee') {
        // Find my manager
        const manager = allEmployees.find(
          (emp: Employee) => emp.employeeId === currentUserRecord.managerId
        );
        setMyManager(manager || null);

        // Find cluster head
        let clusterHead = null;
        if (manager) {
          clusterHead = allEmployees.find(
            (emp: Employee) => emp.employeeId === manager.clusterHeadId
          );
        }
        setMyClusterHead(clusterHead || null);

        // Find all employees under the same manager
        const colleagues = allEmployees.filter(
          (emp: Employee) => 
            emp.role === 'employee' && 
            emp.managerId === currentUserRecord.managerId
        );

        // Find all managers under the same cluster head
        const managers = allEmployees.filter(
          (emp: Employee) => 
            emp.role === 'manager' && 
            (manager ? emp.clusterHeadId === manager.clusterHeadId : false)
        );

        setHierarchy({
          clusterHead: clusterHead,
          managers: managers,
          employees: colleagues
        });
      } else if (currentUser.role === 'manager') {
        // Find my cluster head
        const clusterHead = allEmployees.find(
          (emp: Employee) => emp.employeeId === currentUserRecord.clusterHeadId
        );
        setMyClusterHead(clusterHead || null);

        // Find all managers under the same cluster head
        const managers = allEmployees.filter(
          (emp: Employee) => 
            emp.role === 'manager' && 
            emp.clusterHeadId === currentUserRecord.clusterHeadId
        );

        // Find all employees under me
        const myEmployees = allEmployees.filter(
          (emp: Employee) => 
            emp.role === 'employee' && 
            emp.managerId === currentUser.employeeId
        );

        setHierarchy({
          clusterHead: clusterHead,
          managers: managers,
          employees: myEmployees
        });
      } else if (currentUser.role === 'cluster_head') {
        // Find all managers under me
        const managers = allEmployees.filter(
          (emp: Employee) => 
            emp.role === 'manager' && 
            emp.clusterHeadId === currentUser.employeeId
        );

        // Find all employees under those managers
        const employees = allEmployees.filter(
          (emp: Employee) => 
            emp.role === 'employee' && 
            managers.some(m => m.employeeId === emp.managerId)
        );

        setHierarchy({
          clusterHead: currentUserRecord,
          managers: managers,
          employees: employees
        });
      }

    } catch (error) {
      console.error('Error loading hierarchy:', error);
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getEmployeesForManager = (managerId: string) => {
    return hierarchy.employees.filter(emp => emp.managerId === managerId);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-500">Loading hierarchy...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl text-gray-900 mb-2">Employee Hierarchy</h1>
          <p className="text-gray-600">
            View your organizational structure and reporting lines
          </p>
        </div>

        {/* Hierarchy Visualization */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          {/* Cluster Head Level */}
          {hierarchy.clusterHead && (
            <div className="flex justify-center mb-12">
              <div className="text-center">
                <div className="inline-block">
                  <div className={`w-32 h-32 rounded-2xl flex items-center justify-center mb-4 ${
                    hierarchy.clusterHead.employeeId === currentUser.employeeId
                      ? 'bg-gradient-to-br from-purple-500 to-pink-500 ring-4 ring-purple-200'
                      : 'bg-gradient-to-br from-blue-500 to-indigo-500'
                  }`}>
                    <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center">
                      <span className="text-2xl text-gray-700">
                        {getInitials(hierarchy.clusterHead.name)}
                      </span>
                    </div>
                  </div>
                  <div className="px-6 py-3 bg-gradient-to-r from-purple-100 to-pink-100 rounded-lg border-2 border-purple-300">
                    <p className="font-semibold text-gray-900">{hierarchy.clusterHead.name}</p>
                    <p className="text-sm text-purple-700">Cluster Manager</p>
                    <p className="text-xs text-gray-600 mt-1">{hierarchy.clusterHead.employeeId}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Connecting Line to Managers */}
          {hierarchy.clusterHead && hierarchy.managers.length > 0 && (
            <div className="flex justify-center mb-8">
              <div className="w-px h-12 bg-gray-300"></div>
            </div>
          )}

          {/* Horizontal Line for Managers */}
          {hierarchy.managers.length > 1 && (
            <div className="flex justify-center mb-8">
              <div className="relative w-full max-w-5xl">
                <div className="absolute top-0 left-1/4 right-1/4 h-px bg-gray-300"></div>
              </div>
            </div>
          )}

          {/* Managers Level */}
          {hierarchy.managers.length > 0 && (
            <div className="flex justify-center gap-12 mb-12">
              {hierarchy.managers.map((manager) => (
                <div key={manager.employeeId} className="text-center relative">
                  {/* Vertical connecting line */}
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-12 w-px h-12 bg-gray-300"></div>
                  
                  <div className="inline-block">
                    <div className={`w-28 h-28 rounded-2xl flex items-center justify-center mb-4 ${
                      manager.employeeId === currentUser.employeeId
                        ? 'bg-gradient-to-br from-purple-500 to-pink-500 ring-4 ring-purple-200'
                        : 'bg-gradient-to-br from-green-400 to-emerald-500'
                    }`}>
                      <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center">
                        <span className="text-xl text-gray-700">
                          {getInitials(manager.name)}
                        </span>
                      </div>
                    </div>
                    <div className="px-4 py-3 bg-gradient-to-r from-green-100 to-emerald-100 rounded-lg border-2 border-green-300">
                      <p className="font-semibold text-gray-900">{manager.name}</p>
                      <p className="text-sm text-green-700">{manager.role === 'manager' ? 'Manager' : manager.role}</p>
                      <p className="text-xs text-gray-600 mt-1">{manager.employeeId}</p>
                    </div>
                  </div>

                  {/* Vertical line to employees */}
                  {getEmployeesForManager(manager.employeeId).length > 0 && (
                    <div className="flex justify-center mt-8">
                      <div className="w-px h-12 bg-gray-300"></div>
                    </div>
                  )}

                  {/* Horizontal line for employees under this manager */}
                  {getEmployeesForManager(manager.employeeId).length > 1 && (
                    <div className="flex justify-center mt-12">
                      <div className="relative w-full">
                        <div className="absolute top-0 left-1/4 right-1/4 h-px bg-gray-300"></div>
                      </div>
                    </div>
                  )}

                  {/* Employees under this manager */}
                  {getEmployeesForManager(manager.employeeId).length > 0 && (
                    <div className="flex justify-center gap-6 mt-12">
                      {getEmployeesForManager(manager.employeeId).map((employee) => (
                        <div key={employee.employeeId} className="text-center relative">
                          {/* Vertical connecting line */}
                          <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-12 w-px h-12 bg-gray-300"></div>
                          
                          <div className="inline-block">
                            <div className={`w-20 h-20 rounded-xl flex items-center justify-center mb-3 ${
                              employee.employeeId === currentUser.employeeId
                                ? 'bg-gradient-to-br from-purple-500 to-pink-500 ring-4 ring-purple-200'
                                : 'bg-gradient-to-br from-gray-400 to-gray-500'
                            }`}>
                              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center">
                                <span className="text-sm text-gray-700">
                                  {getInitials(employee.name)}
                                </span>
                              </div>
                            </div>
                            <div className="px-3 py-2 bg-gray-100 rounded-lg border-2 border-gray-300 max-w-[140px]">
                              <p className="text-sm font-semibold text-gray-900 truncate">{employee.name}</p>
                              <p className="text-xs text-gray-600">{employee.role === 'employee' ? 'Employee' : employee.role}</p>
                              <p className="text-xs text-gray-500 mt-1">{employee.employeeId}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* If no managers but has employees (direct reports to cluster head) */}
          {hierarchy.managers.length === 0 && hierarchy.employees.length > 0 && (
            <>
              <div className="flex justify-center mb-8">
                <div className="w-px h-12 bg-gray-300"></div>
              </div>
              
              {hierarchy.employees.length > 1 && (
                <div className="flex justify-center mb-8">
                  <div className="relative w-full max-w-4xl">
                    <div className="absolute top-0 left-1/4 right-1/4 h-px bg-gray-300"></div>
                  </div>
                </div>
              )}

              <div className="flex justify-center gap-6 flex-wrap">
                {hierarchy.employees.map((employee) => (
                  <div key={employee.employeeId} className="text-center relative">
                    <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-12 w-px h-12 bg-gray-300"></div>
                    
                    <div className="inline-block">
                      <div className={`w-20 h-20 rounded-xl flex items-center justify-center mb-3 ${
                        employee.employeeId === currentUser.employeeId
                          ? 'bg-gradient-to-br from-purple-500 to-pink-500 ring-4 ring-purple-200'
                          : 'bg-gradient-to-br from-gray-400 to-gray-500'
                      }`}>
                        <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center">
                          <span className="text-sm text-gray-700">
                            {getInitials(employee.name)}
                          </span>
                        </div>
                      </div>
                      <div className="px-3 py-2 bg-gray-100 rounded-lg border-2 border-gray-300 max-w-[140px]">
                        <p className="text-sm font-semibold text-gray-900 truncate">{employee.name}</p>
                        <p className="text-xs text-gray-600">Employee</p>
                        <p className="text-xs text-gray-500 mt-1">{employee.employeeId}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Empty State */}
          {!hierarchy.clusterHead && hierarchy.managers.length === 0 && hierarchy.employees.length === 0 && (
            <div className="text-center py-12">
              <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg text-gray-600 mb-2">No Hierarchy Found</h3>
              <p className="text-sm text-gray-500">
                Your organizational hierarchy hasn't been set up yet.
              </p>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="mt-6 bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Legend</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 ring-4 ring-purple-200 rounded-lg"></div>
              <span className="text-sm text-gray-700">You (Current User)</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg"></div>
              <span className="text-sm text-gray-700">Cluster Manager</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-green-400 to-emerald-500 rounded-lg"></div>
              <span className="text-sm text-gray-700">Manager</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-gray-400 to-gray-500 rounded-lg"></div>
              <span className="text-sm text-gray-700">Employee</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
