import { useState, useEffect } from 'react';
import { Users, Building2, ChevronDown } from 'lucide-react';
import * as api from '../utils/api';

interface Employee {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  role: 'manager' | 'employee' | 'cluster_head';
  designation?: string;
  managerId?: string;
  clusterHeadId?: string;
  inchargeId?: string;
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
  const [reportingChain, setReportingChain] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

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

      console.log('[Hierarchy Debug] Current user record:', currentUserRecord);

      // Build the reporting chain from current user UP to cluster head
      const chainFromBottom: Employee[] = [currentUserRecord];
      let currentPerson = currentUserRecord;
      let iterations = 0;
      const maxIterations = 10;

      while (currentPerson && iterations < maxIterations) {
        const superiorId = currentPerson.clusterHeadId || currentPerson.managerId || currentPerson.inchargeId;
        console.log('[Hierarchy Debug] Looking for superior ID:', superiorId, 'for', currentPerson.name);

        if (!superiorId) break;

        const superior = allEmployees.find(
          (emp: Employee) => emp.employeeId === superiorId
        );

        console.log('[Hierarchy Debug] Found superior:', superior);

        if (superior) {
          // Check if we already have this person (prevent circular references)
          if (chainFromBottom.some(emp => emp.employeeId === superior.employeeId)) {
            console.log('[Hierarchy Debug] Circular reference detected, breaking');
            break;
          }
          
          chainFromBottom.push(superior);
          currentPerson = superior;

          // If we reached cluster head, stop
          if (superior.role === 'cluster_head') {
            console.log('[Hierarchy Debug] Reached cluster head');
            break;
          }
        } else {
          break;
        }

        iterations++;
      }

      // Reverse the chain so it goes from top (cluster head) to bottom (employee)
      const chainFromTop = chainFromBottom.reverse();
      console.log('[Hierarchy Debug] Final reporting chain (top to bottom):', chainFromTop);
      
      setReportingChain(chainFromTop);

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

  // Helper function to format designation for display
  const formatDesignation = (designation?: string, role?: string) => {
    if (!designation && !role) return 'N/A';
    
    if (designation) {
      const designationMap: Record<string, string> = {
        'operations_incharge': 'Operations Incharge',
        'store_incharge': 'Store Incharge',
        'production_incharge': 'Production Incharge',
        'operations_manager': 'Operations Manager',
        'store_ops': 'Store Operations',
        'production_ops': 'Production Operations',
      };
      
      return designationMap[designation] || designation;
    }
    
    // Fallback to role if no designation (legacy data)
    const roleMap: Record<string, string> = {
      'cluster_head': 'Cluster Head',
      'manager': 'Manager',
      'employee': 'Employee'
    };
    
    return roleMap[role || ''] || role || 'N/A';
  };

  const getRoleColor = (person: Employee, isCurrentUser: boolean) => {
    if (isCurrentUser) {
      return 'bg-gradient-to-br from-purple-500 to-pink-500 ring-4 ring-purple-200';
    }
    
    if (person.role === 'cluster_head') {
      return 'bg-gradient-to-br from-blue-500 to-indigo-500';
    }
    
    if (person.role === 'manager' || person.designation?.includes('incharge') || person.designation === 'operations_manager') {
      return 'bg-gradient-to-br from-green-400 to-emerald-500';
    }
    
    return 'bg-gradient-to-br from-gray-400 to-gray-500';
  };

  const getCardBgColor = (person: Employee, isCurrentUser: boolean) => {
    if (isCurrentUser) {
      return 'bg-gradient-to-r from-purple-100 to-pink-100 border-purple-300';
    }
    
    if (person.role === 'cluster_head') {
      return 'bg-gradient-to-r from-blue-100 to-indigo-100 border-blue-300';
    }
    
    if (person.role === 'manager' || person.designation?.includes('incharge') || person.designation === 'operations_manager') {
      return 'bg-gradient-to-r from-green-100 to-emerald-100 border-green-300';
    }
    
    return 'bg-gray-100 border-gray-300';
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
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl text-gray-900 mb-2">Employee Hierarchy</h1>
          <p className="text-gray-600">
            View your reporting chain from top to bottom
          </p>
        </div>

        {/* Hierarchy Visualization */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          {reportingChain.length > 0 ? (
            <div className="flex flex-col items-center">
              {reportingChain.map((person, index) => {
                const isCurrentUser = person.employeeId === currentUser.employeeId;
                const isLast = index === reportingChain.length - 1;
                
                return (
                  <div key={person.employeeId} className="w-full flex flex-col items-center">
                    {/* Person Card */}
                    <div className="text-center">
                      <div className="inline-block">
                        {/* Avatar Circle */}
                        <div className={`w-28 h-28 rounded-2xl flex items-center justify-center mb-4 ${getRoleColor(person, isCurrentUser)}`}>
                          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center">
                            <span className="text-xl text-gray-700">
                              {getInitials(person.name)}
                            </span>
                          </div>
                        </div>
                        
                        {/* Info Card */}
                        <div className={`px-6 py-3 rounded-lg border-2 ${getCardBgColor(person, isCurrentUser)}`}>
                          <p className="font-semibold text-gray-900">{person.name}</p>
                          <p className="text-sm text-gray-700">
                            {formatDesignation(person.designation, person.role)}
                          </p>
                          <p className="text-xs text-gray-600 mt-1">{person.employeeId}</p>
                          {isCurrentUser && (
                            <p className="text-xs text-purple-600 mt-1 font-semibold">(You)</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Connecting Arrow */}
                    {!isLast && (
                      <div className="flex flex-col items-center my-6">
                        <div className="w-px h-8 bg-gray-300"></div>
                        <ChevronDown className="w-6 h-6 text-gray-400" />
                        <div className="w-px h-8 bg-gray-300"></div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 ring-4 ring-purple-200 rounded-lg"></div>
              <span className="text-sm text-gray-700">You (Current User)</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg"></div>
              <span className="text-sm text-gray-700">Cluster Head</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-green-400 to-emerald-500 rounded-lg"></div>
              <span className="text-sm text-gray-700">Manager / Incharge</span>
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
