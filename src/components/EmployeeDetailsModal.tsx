import { useState, useEffect } from 'react';
import { X, Save, User, Mail, Briefcase, Building2, Users as UsersIcon } from 'lucide-react';
import * as api from '../utils/api';

interface Employee {
  employeeId: string;
  name: string;
  email: string;
  role: 'employee' | 'manager' | 'cluster_head';
  managerId?: string;
  clusterHeadId?: string;
  designation?: 'operations_incharge' | 'store_incharge' | 'production_incharge' | 'store_ops' | 'production_ops' | null;
  department?: 'store_operations' | 'production' | null;
  inchargeId?: string;
  storeId?: string;
}

interface EmployeeDetailsModalProps {
  employee: Employee;
  onClose: () => void;
  onSave: () => void;
  clusterHeadId?: string; // Optional cluster head ID for auto-assignment
}

export function EmployeeDetailsModal({ employee, onClose, onSave, clusterHeadId }: EmployeeDetailsModalProps) {
  const [formData, setFormData] = useState({
    role: employee.role,
    designation: employee.designation || null,
    department: employee.department || null,
    clusterHeadId: employee.clusterHeadId || '',
    storeId: employee.storeId || '',
  });
  const [saving, setSaving] = useState(false);
  const [stores, setStores] = useState<any[]>([]);

  useEffect(() => {
    loadStores();
  }, []);

  const loadStores = async () => {
    try {
      const storesData = await api.getStores();
      setStores(storesData);
    } catch (error) {
      console.error('Error loading stores:', error);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      
      const updates: any = {
        role: formData.role,
        designation: formData.designation,
        department: formData.department,
        storeId: formData.storeId || null,
      };

      // For managers, clusterHeadId is optional (they can report to another manager via managerId instead)
      if (formData.role === 'manager') {
        // Explicitly set clusterHeadId (could be empty string to clear it)
        updates.clusterHeadId = formData.clusterHeadId || null;
      }

      await api.updateUnifiedEmployee(employee.employeeId, updates);
      
      alert('Employee details updated successfully!');
      onSave();
      onClose();
      
    } catch (error) {
      console.error('Error updating employee:', error);
      alert('Failed to update employee details');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-pink-600 text-white px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <User className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Edit Employee Details</h2>
              <p className="text-sm text-purple-100">{employee.name} ({employee.employeeId})</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Basic Info (Read-only) */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-gray-700">
              <User className="w-4 h-4" />
              <span className="font-medium">Name:</span>
              <span>{employee.name}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <Mail className="w-4 h-4" />
              <span className="font-medium">Email:</span>
              <span>{employee.email}</span>
            </div>
          </div>

          {/* Role Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Briefcase className="w-4 h-4 inline mr-2" />
              Role (System Permission Level)
            </label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
              <option value="cluster_head">Cluster Head</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Role determines system permissions (who can manage whom)
            </p>
          </div>

          {/* Cluster Head ID (only for managers) */}
          {formData.role === 'manager' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <UsersIcon className="w-4 h-4 inline mr-2" />
                Cluster Head ID (Optional)
              </label>
              <input
                type="text"
                value={formData.clusterHeadId}
                onChange={(e) => setFormData({ ...formData, clusterHeadId: e.target.value })}
                placeholder="e.g., BM005 (leave empty if reporting to another manager)"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                Only for top-level managers. Leave empty if this manager reports to another manager (set via Hierarchy tab instead).
              </p>
            </div>
          )}

          {/* Designation Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Briefcase className="w-4 h-4 inline mr-2" />
              Designation (Job Title)
            </label>
            <select
              value={formData.designation || ''}
              onChange={(e) => setFormData({ 
                ...formData, 
                designation: e.target.value as any || null 
              })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="">No Designation</option>
              <option value="operations_incharge">Operations Incharge</option>
              <option value="store_incharge">Store Incharge</option>
              <option value="production_incharge">Production Incharge</option>
              <option value="store_ops">Store Operations</option>
              <option value="production_ops">Production Operations</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Designation is the job title (appears in organization chart)
            </p>
          </div>

          {/* Store ID (only for store incharge and store ops) */}
          {(formData.designation === 'store_incharge' || formData.designation === 'store_ops') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Building2 className="w-4 h-4 inline mr-2" />
                Store Assignment
              </label>
              <select
                value={formData.storeId || ''}
                onChange={(e) => setFormData({ ...formData, storeId: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="">No Store</option>
                {stores.map(store => (
                  <option key={store.id} value={store.id}>{store.name}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Assign to a specific store location
              </p>
            </div>
          )}

          {/* Department Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Building2 className="w-4 h-4 inline mr-2" />
              Department
            </label>
            <select
              value={formData.department || ''}
              onChange={(e) => setFormData({ 
                ...formData, 
                department: e.target.value as any || null 
              })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="">No Department</option>
              <option value="store_operations">Store Operations</option>
              <option value="production">Production</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Department determines which operations they can manage
            </p>
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-semibold text-blue-900 mb-2">Understanding Role vs Designation:</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• <strong>Role</strong> = System permission level (employee/manager/cluster_head)</li>
              <li>• <strong>Designation</strong> = Job title (Store Incharge, Operations Manager, etc.)</li>
              <li>• Example: BM008 can have role="manager" + designation="store_incharge"</li>
              <li>• This allows them to manage employees while having "Store Incharge" as their title</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 px-6 py-4 flex items-center justify-end gap-3 rounded-b-2xl border-t">
          <button
            onClick={onClose}
            className="px-6 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}