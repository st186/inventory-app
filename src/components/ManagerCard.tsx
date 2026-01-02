import { ChevronRight, UserCog, User } from 'lucide-react';

interface Employee {
  employeeId: string;
  name: string;
  email: string;
  role: 'cluster_head' | 'manager' | 'employee';
  designation?: string;
}

interface ManagerNode extends Employee {
  employees?: Employee[];
  managers?: ManagerNode[];
}

interface ManagerCardProps {
  manager: ManagerNode;
  level?: number;
}

export function ManagerCard({ manager, level = 0 }: ManagerCardProps) {
  const hasSubordinates = (manager.managers && manager.managers.length > 0) || (manager.employees && manager.employees.length > 0);
  
  // Format designation for display
  const formatDesignation = (designation?: string) => {
    if (!designation) return 'Manager';
    
    const designationMap: Record<string, string> = {
      'operations_incharge': 'Operations Incharge',
      'store_incharge': 'Store Incharge',
      'production_incharge': 'Production Incharge',
      'store_ops': 'Store Operations',
      'production_ops': 'Production Operations',
    };
    
    return designationMap[designation] || designation;
  };
  
  return (
    <div className="mb-4 last:mb-0 border border-gray-200 rounded-lg bg-white">
      {/* Manager Header */}
      <div className="bg-gradient-to-r from-green-50 to-green-100 p-4">
        <div className="flex items-center gap-3">
          <ChevronRight className="w-5 h-5 text-gray-400" />
          <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center text-white">
            <UserCog className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h4 className="text-gray-900">{manager.name}</h4>
              <span className="px-2 py-1 bg-green-600 text-white text-xs rounded">
                {formatDesignation(manager.designation)}
              </span>
            </div>
            <div className="text-sm text-gray-600">{manager.employeeId} • {manager.email}</div>
          </div>
        </div>
      </div>

      {/* Subordinates */}
      {hasSubordinates && (
        <div className="p-4 space-y-4 bg-gray-50">
          {/* Subordinate Managers (Recursive) */}
          {manager.managers && manager.managers.length > 0 && (
            <div className="space-y-3">
              {manager.managers.map((subManager) => (
                <ManagerCard key={subManager.employeeId} manager={subManager} level={level + 1} />
              ))}
            </div>
          )}
          
          {/* Direct Employees */}
          {manager.employees && manager.employees.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">Direct Reports:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {manager.employees.map((employee) => (
                  <div key={employee.employeeId} className="flex items-center gap-3 p-3 bg-pink-50 rounded-lg border border-pink-100">
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
      )}
    </div>
  );
}
