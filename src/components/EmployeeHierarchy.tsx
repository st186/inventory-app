import { useState, useEffect } from 'react';
import { Users, User, Calendar, Mail, CheckCircle, XCircle, Clock } from 'lucide-react';
import * as api from '../utils/api';

interface EmployeeHierarchyProps {
  managerId: string;
  role: 'manager' | 'cluster_head';
}

export function EmployeeHierarchy({ managerId, role }: EmployeeHierarchyProps) {
  const [employees, setEmployees] = useState<any[]>([]);
  const [managers, setManagers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
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
            ...mgr.stats
          };
        }
        setStats(statsData);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50 p-6 flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl text-gray-900 mb-2">
            {role === 'manager' ? 'My Team' : 'Manager Overview'}
          </h1>
          <p className="text-gray-600">
            {role === 'manager' 
              ? 'View all employees under your management' 
              : 'View all managers and their team performance'}
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <Users className="w-12 h-12 opacity-80" />
              <div className="text-right">
                <div className="text-3xl">
                  {role === 'manager' ? employees.length : managers.length}
                </div>
                <div className="text-sm opacity-90">
                  {role === 'manager' ? 'Total Employees' : 'Total Managers'}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-xl shadow-lg p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <Clock className="w-12 h-12 opacity-80" />
              <div className="text-right">
                <div className="text-3xl">
                  {Object.values(stats).reduce((sum: number, s: any) => sum + (s.pendingTimesheets || 0), 0)}
                </div>
                <div className="text-sm opacity-90">Pending Timesheets</div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-pink-500 to-pink-600 rounded-xl shadow-lg p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <Calendar className="w-12 h-12 opacity-80" />
              <div className="text-right">
                <div className="text-3xl">
                  {Object.values(stats).reduce((sum: number, s: any) => sum + (s.pendingLeaves || 0), 0)}
                </div>
                <div className="text-sm opacity-90">Pending Leaves</div>
              </div>
            </div>
          </div>
        </div>

        {/* Employee/Manager List */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-purple-100 to-pink-100 border-b border-gray-200">
            <h3 className="text-lg text-gray-900">
              {role === 'manager' ? 'Employee List' : 'Manager List'}
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
            {(role === 'manager' ? employees : managers).map((person) => (
              <div key={person.employeeId} className="border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
                {/* Avatar */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center text-white text-xl">
                    {person.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="text-lg text-gray-900">{person.name}</h4>
                    <p className="text-sm text-gray-600">{person.employeeId}</p>
                  </div>
                </div>

                {/* Info */}
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Mail className="w-4 h-4" />
                    {person.email}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Calendar className="w-4 h-4" />
                    Joined: {person.joiningDate ? new Date(person.joiningDate).toLocaleDateString() : 'N/A'}
                  </div>
                </div>

                {/* Stats */}
                {stats[person.employeeId] && (
                  <div className="border-t border-gray-200 pt-4">
                    <div className="grid grid-cols-2 gap-3">
                      {role === 'manager' ? (
                        <>
                          <div className="bg-yellow-50 rounded-lg p-3">
                            <div className="text-xs text-gray-600 mb-1">Pending Timesheets</div>
                            <div className="text-xl text-yellow-700">{stats[person.employeeId].pendingTimesheets}</div>
                          </div>
                          <div className="bg-pink-50 rounded-lg p-3">
                            <div className="text-xs text-gray-600 mb-1">Pending Leaves</div>
                            <div className="text-xl text-pink-700">{stats[person.employeeId].pendingLeaves}</div>
                          </div>
                          <div className="bg-green-50 rounded-lg p-3">
                            <div className="text-xs text-gray-600 mb-1">Approved Timesheets</div>
                            <div className="text-xl text-green-700">{stats[person.employeeId].approvedTimesheets}</div>
                          </div>
                          <div className="bg-blue-50 rounded-lg p-3">
                            <div className="text-xs text-gray-600 mb-1">Total Leaves</div>
                            <div className="text-xl text-blue-700">{stats[person.employeeId].totalLeaves}</div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="bg-purple-50 rounded-lg p-3 col-span-2">
                            <div className="text-xs text-gray-600 mb-1">Employees</div>
                            <div className="text-2xl text-purple-700">{stats[person.employeeId].employeeCount}</div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {(role === 'manager' ? employees : managers).length === 0 && (
            <div className="p-12 text-center">
              <User className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">
                {role === 'manager' ? 'No employees found' : 'No managers found'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
