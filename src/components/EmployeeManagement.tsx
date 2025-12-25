import { useState, useEffect } from 'react';
import { Users, UserPlus, Search, Edit2, Trash2, Calendar, DollarSign, FileText, Upload, KeyRound } from 'lucide-react';
import * as api from '../utils/api';
import { EmployeeAccountSetup } from './EmployeeAccountSetup';
import { HierarchyManagement } from './HierarchyManagement';

interface Employee {
  id: string;
  employeeId: string; // BM001, BM002, etc.
  name: string;
  email: string;
  role: 'manager' | 'employee' | 'cluster_head';
  employmentType: 'fulltime' | 'contract';
  joiningDate: string;
  dob?: string;
  phone?: string;
  aadharFront?: string;
  aadharBack?: string;
  managerId?: string; // For employees under a manager
  clusterHeadId?: string; // For managers under cluster head
  createdBy: string;
  createdAt: string;
  status: 'active' | 'inactive';
}

interface EmployeeManagementProps {
  user: {
    role: string;
    email: string;
    employeeId?: string;
    name: string;
  };
}

export function EmployeeManagement({ user }: EmployeeManagementProps) {
  const [activeTab, setActiveTab] = useState<'employees' | 'hierarchy'>('employees');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [showAccountSetup, setShowAccountSetup] = useState(false);
  const [aadharFront, setAadharFront] = useState('');
  const [aadharBack, setAadharBack] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'employee' as 'manager' | 'employee' | 'cluster_head',
    employmentType: 'fulltime' as 'fulltime' | 'contract',
    joiningDate: new Date().toISOString().split('T')[0],
    dob: '',
    phone: '',
  });

  console.log('EmployeeManagement: Current user:', user);
  console.log('EmployeeManagement: User employeeId:', user.employeeId);
  console.log('EmployeeManagement: User role:', user.role);

  const isManager = user.role === 'manager';
  const isClusterHead = user.role === 'cluster_head';

  // Auto-set employment type to fulltime when role is cluster_head
  useEffect(() => {
    if (formData.role === 'cluster_head') {
      setFormData(prev => ({ ...prev, employmentType: 'fulltime' }));
    }
  }, [formData.role]);

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    try {
      setLoading(true);
      const data = await api.getAllEmployees();
      
      // Filter based on user role
      let filtered = data;
      if (isManager) {
        // Managers see only their employees
        filtered = data.filter((emp: Employee) => emp.managerId === user.employeeId);
      } else if (isClusterHead) {
        // Cluster heads see all managers and their employees
        filtered = data;
      }
      
      setEmployees(filtered);
    } catch (error) {
      console.error('Error loading employees:', error);
      alert('Failed to load employees');
    } finally {
      setLoading(false);
    }
  };

  const generateEmployeeId = async () => {
    try {
      const allEmployees = await api.getAllEmployees();
      
      // Extract numbers from existing IDs (BM001 -> 1, BM002 -> 2)
      const numbers = allEmployees
        .map((emp: Employee) => {
          const match = emp.employeeId.match(/BM(\d+)/);
          return match ? parseInt(match[1]) : 0;
        })
        .filter((num: number) => num > 0);
      
      // Get the highest number and add 1
      const nextNumber = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
      
      // Format as BM001, BM002, etc.
      return `BM${nextNumber.toString().padStart(3, '0')}`;
    } catch (error) {
      console.error('Error generating employee ID:', error);
      return `BM${Date.now().toString().slice(-3)}`;
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'front' | 'back') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      if (type === 'front') {
        setAadharFront(base64);
      } else {
        setAadharBack(base64);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCreateEmployee = async () => {
    if (!formData.name || !formData.email || !formData.password) {
      alert('Please fill all required fields');
      return;
    }

    // Validate role permissions
    if (isManager && formData.role === 'manager') {
      alert('Only Cluster Heads can create managers');
      return;
    }

    try {
      setLoading(true);
      
      // Generate unique employee ID
      const employeeId = await generateEmployeeId();

      const employeeData: any = {
        employeeId,
        name: formData.name,
        email: formData.email,
        password: formData.password,
        role: formData.role,
        employmentType: formData.employmentType,
        joiningDate: formData.joiningDate,
        dob: formData.dob,
        phone: formData.phone,
        status: 'active',
        createdBy: user.email,
        createdAt: new Date().toISOString(),
      };

      // Add hierarchy relationships
      if (formData.role === 'employee') {
        employeeData.managerId = user.employeeId; // Employee reports to current user (manager)
      } else if (formData.role === 'manager') {
        employeeData.clusterHeadId = user.employeeId; // Manager reports to current user (cluster head)
      }

      // Add Aadhar if uploaded
      if (aadharFront) employeeData.aadharFront = aadharFront;
      if (aadharBack) employeeData.aadharBack = aadharBack;

      await api.createUnifiedEmployee(employeeData);
      
      alert(`Employee created successfully! ID: ${employeeId}`);
      
      // Reset form
      setFormData({
        name: '',
        email: '',
        password: '',
        role: 'employee',
        employmentType: 'fulltime',
        joiningDate: new Date().toISOString().split('T')[0],
        dob: '',
        phone: '',
      });
      setAadharFront('');
      setAadharBack('');
      setShowCreateForm(false);
      
      await loadEmployees();
    } catch (error) {
      console.error('Error creating employee:', error);
      alert('Failed to create employee. Email might already be in use.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEmployee = async (employeeId: string) => {
    if (!confirm('Are you sure you want to delete this employee?')) return;

    try {
      setLoading(true);
      await api.deleteUnifiedEmployee(employeeId);
      alert('Employee deleted successfully');
      await loadEmployees();
    } catch (error) {
      console.error('Error deleting employee:', error);
      alert('Failed to delete employee');
    } finally {
      setLoading(false);
    }
  };

  const handleEditEmployee = (emp: Employee) => {
    setEditingEmployee(emp);
    setShowEditForm(true);
  };

  const handleUpdateEmployee = async () => {
    if (!editingEmployee) return;

    try {
      setLoading(true);
      
      // Allow editing role for cluster heads
      const updateData = {
        name: editingEmployee.name,
        email: editingEmployee.email,
        role: editingEmployee.role, // Include role in updates
        employmentType: editingEmployee.employmentType,
        joiningDate: editingEmployee.joiningDate,
        dob: editingEmployee.dob,
        phone: editingEmployee.phone,
        status: editingEmployee.status,
      };

      console.log('Updating employee with data:', updateData);
      
      // Update using API function
      await api.updateUnifiedEmployee(editingEmployee.employeeId, updateData);

      alert('Employee updated successfully!');
      setShowEditForm(false);
      setEditingEmployee(null);
      await loadEmployees();
    } catch (error) {
      console.error('Error updating employee - full error:', error);
      console.error('Error updating employee - error message:', error instanceof Error ? error.message : String(error));
      alert(`Failed to update employee: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const getEmployeeStats = () => {
    const total = employees.length;
    const managers = employees.filter(e => e.role === 'manager').length;
    const fulltime = employees.filter(e => e.employmentType === 'fulltime').length;
    const contract = employees.filter(e => e.employmentType === 'contract').length;
    const active = employees.filter(e => e.status === 'active').length;

    return { total, managers, fulltime, contract, active };
  };

  const stats = getEmployeeStats();

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl text-gray-900 mb-2">Employee Management</h1>
          <p className="text-gray-600">Unified employee, manager, and contract worker management</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-md p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total</p>
                <p className="text-2xl text-gray-900">{stats.total}</p>
              </div>
              <Users className="w-8 h-8 text-purple-500" />
            </div>
          </div>

          {isClusterHead && (
            <div className="bg-white rounded-lg shadow-md p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Managers</p>
                  <p className="text-2xl text-gray-900">{stats.managers}</p>
                </div>
                <Users className="w-8 h-8 text-blue-500" />
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg shadow-md p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Full-Time</p>
                <p className="text-2xl text-gray-900">{stats.fulltime}</p>
              </div>
              <FileText className="w-8 h-8 text-green-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Contract</p>
                <p className="text-2xl text-gray-900">{stats.contract}</p>
              </div>
              <FileText className="w-8 h-8 text-orange-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Active</p>
                <p className="text-2xl text-gray-900">{stats.active}</p>
              </div>
              <Users className="w-8 h-8 text-pink-500" />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-md mb-6">
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('employees')}
              className={`flex-1 px-6 py-4 text-center transition-colors ${
                activeTab === 'employees'
                  ? 'border-b-2 border-purple-600 text-purple-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Users className="w-5 h-5" />
                <span>Employee List</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('hierarchy')}
              className={`flex-1 px-6 py-4 text-center transition-colors ${
                activeTab === 'hierarchy'
                  ? 'border-b-2 border-purple-600 text-purple-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Users className="w-5 h-5" />
                <span>Hierarchy</span>
              </div>
            </button>
          </div>
        </div>

        {/* Conditional Rendering based on Active Tab */}
        {activeTab === 'hierarchy' ? (
          <HierarchyManagement userRole={user.role as 'cluster_head' | 'manager' | 'employee'} />
        ) : (
          <>
            {/* Action Bar */}
            <div className="bg-white rounded-lg shadow-md p-4 mb-6">
              <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search by name, ID, or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowCreateForm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:shadow-lg transition-all"
              >
                <UserPlus className="w-5 h-5" />
                Add {isClusterHead ? 'Employee/Manager' : 'Employee'}
              </button>
              {isClusterHead && (
                <button
                  onClick={() => setShowAccountSetup(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-all"
                >
                  <KeyRound className="w-5 h-5" />
                  Create Login Accounts
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Create Employee Form */}
        {showCreateForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-pink-600 text-white p-6 rounded-t-xl">
                <h2 className="text-2xl">Create New {isClusterHead ? 'Employee/Manager' : 'Employee'}</h2>
              </div>

              <div className="p-6 space-y-4">
                {/* Role Selection (Cluster Head Only) */}
                {isClusterHead && (
                  <div>
                    <label className="block text-sm text-gray-700 mb-2">Role *</label>
                    <select
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value as 'manager' | 'employee' | 'cluster_head' })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    >
                      <option value="employee">Employee</option>
                      <option value="manager">Manager</option>
                      <option value="cluster_head">Cluster Head</option>
                    </select>
                  </div>
                )}

                {/* Employment Type */}
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Employment Type *</label>
                  <select
                    value={formData.employmentType}
                    onChange={(e) => setFormData({ ...formData, employmentType: e.target.value as 'fulltime' | 'contract' })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    disabled={formData.role === 'cluster_head'}
                  >
                    <option value="fulltime">Full-Time</option>
                    {formData.role !== 'cluster_head' && <option value="contract">Contract</option>}
                  </select>
                  {formData.role === 'cluster_head' && (
                    <p className="text-xs text-gray-500 mt-1">Cluster heads are always full-time employees</p>
                  )}
                </div>

                {/* Name */}
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Full Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="Enter full name"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Email *</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="employee@example.com"
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Password *</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="Create a password"
                  />
                </div>

                {/* Date of Birth */}
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Date of Birth</label>
                  <input
                    type="date"
                    value={formData.dob}
                    onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Phone Number</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="+91 9876543210"
                  />
                </div>

                {/* Joining Date */}
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Joining Date *</label>
                  <input
                    type="date"
                    value={formData.joiningDate}
                    onChange={(e) => setFormData({ ...formData, joiningDate: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                {/* Aadhar Upload (For employees only) */}
                {formData.role === 'employee' && (
                  <>
                    <div>
                      <label className="block text-sm text-gray-700 mb-2">Aadhar Card (Front)</label>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg cursor-pointer hover:bg-gray-200 transition-colors">
                          <Upload className="w-5 h-5" />
                          {aadharFront ? 'Change Front' : 'Upload Front'}
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleFileUpload(e, 'front')}
                            className="hidden"
                          />
                        </label>
                        {aadharFront && <span className="text-sm text-green-600">✓ Uploaded</span>}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm text-gray-700 mb-2">Aadhar Card (Back)</label>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg cursor-pointer hover:bg-gray-200 transition-colors">
                          <Upload className="w-5 h-5" />
                          {aadharBack ? 'Change Back' : 'Upload Back'}
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleFileUpload(e, 'back')}
                            className="hidden"
                          />
                        </label>
                        {aadharBack && <span className="text-sm text-green-600">✓ Uploaded</span>}
                      </div>
                    </div>
                  </>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleCreateEmployee}
                    disabled={loading}
                    className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 text-white py-3 rounded-lg hover:shadow-lg transition-all disabled:opacity-50"
                  >
                    {loading ? 'Creating...' : 'Create Employee'}
                  </button>
                  <button
                    onClick={() => {
                      setShowCreateForm(false);
                      setFormData({
                        name: '',
                        email: '',
                        password: '',
                        role: 'employee',
                        employmentType: 'fulltime',
                        joiningDate: new Date().toISOString().split('T')[0],
                        dob: '',
                        phone: '',
                      });
                      setAadharFront('');
                      setAadharBack('');
                    }}
                    className="px-6 bg-gray-200 text-gray-700 py-3 rounded-lg hover:bg-gray-300 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Edit Employee Form */}
        {showEditForm && editingEmployee && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-pink-600 text-white p-6 rounded-t-xl">
                <h2 className="text-2xl">Edit Employee</h2>
              </div>

              <div className="p-6 space-y-4">
                {/* Role Selection (Cluster Head Only) */}
                {isClusterHead && (
                  <div>
                    <label className="block text-sm text-gray-700 mb-2">Role *</label>
                    <select
                      value={editingEmployee.role}
                      onChange={(e) => setEditingEmployee({ ...editingEmployee, role: e.target.value as 'manager' | 'employee' | 'cluster_head' })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    >
                      <option value="employee">Employee</option>
                      <option value="manager">Manager</option>
                      <option value="cluster_head">Cluster Head</option>
                    </select>
                  </div>
                )}

                {/* Employment Type */}
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Employment Type *</label>
                  <select
                    value={editingEmployee.employmentType}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, employmentType: e.target.value as 'fulltime' | 'contract' })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="fulltime">Full-Time</option>
                    <option value="contract">Contract</option>
                  </select>
                </div>

                {/* Name */}
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Full Name *</label>
                  <input
                    type="text"
                    value={editingEmployee.name}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="Enter full name"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Email *</label>
                  <input
                    type="email"
                    value={editingEmployee.email}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, email: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="employee@example.com"
                  />
                </div>

                {/* Date of Birth */}
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Date of Birth</label>
                  <input
                    type="date"
                    value={editingEmployee.dob}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, dob: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Phone Number</label>
                  <input
                    type="tel"
                    value={editingEmployee.phone}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, phone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="+91 9876543210"
                  />
                </div>

                {/* Joining Date */}
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Joining Date *</label>
                  <input
                    type="date"
                    value={editingEmployee.joiningDate}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, joiningDate: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                {/* Aadhar Upload (For employees only) */}
                {editingEmployee.role === 'employee' && (
                  <>
                    <div>
                      <label className="block text-sm text-gray-700 mb-2">Aadhar Card (Front)</label>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg cursor-pointer hover:bg-gray-200 transition-colors">
                          <Upload className="w-5 h-5" />
                          {aadharFront ? 'Change Front' : 'Upload Front'}
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleFileUpload(e, 'front')}
                            className="hidden"
                          />
                        </label>
                        {aadharFront && <span className="text-sm text-green-600">✓ Uploaded</span>}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm text-gray-700 mb-2">Aadhar Card (Back)</label>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg cursor-pointer hover:bg-gray-200 transition-colors">
                          <Upload className="w-5 h-5" />
                          {aadharBack ? 'Change Back' : 'Upload Back'}
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleFileUpload(e, 'back')}
                            className="hidden"
                          />
                        </label>
                        {aadharBack && <span className="text-sm text-green-600">✓ Uploaded</span>}
                      </div>
                    </div>
                  </>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleUpdateEmployee}
                    disabled={loading}
                    className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 text-white py-3 rounded-lg hover:shadow-lg transition-all disabled:opacity-50"
                  >
                    {loading ? 'Updating...' : 'Update Employee'}
                  </button>
                  <button
                    onClick={() => {
                      setShowEditForm(false);
                      setEditingEmployee(null);
                      setAadharFront('');
                      setAadharBack('');
                    }}
                    className="px-6 bg-gray-200 text-gray-700 py-3 rounded-lg hover:bg-gray-300 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Employee List */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-purple-100 to-pink-100">
                <tr>
                  <th className="px-6 py-3 text-left text-xs text-gray-700 uppercase tracking-wider">Employee ID</th>
                  <th className="px-6 py-3 text-left text-xs text-gray-700 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs text-gray-700 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-left text-xs text-gray-700 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-3 text-left text-xs text-gray-700 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-left text-xs text-gray-700 uppercase tracking-wider">Joining Date</th>
                  <th className="px-6 py-3 text-left text-xs text-gray-700 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs text-gray-700 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                      Loading employees...
                    </td>
                  </tr>
                ) : employees.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                      No employees found
                    </td>
                  </tr>
                ) : (
                  employees.map((emp) => (
                    <tr key={emp.employeeId} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm">
                          {emp.employeeId}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-900">{emp.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-600">{emp.email}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-3 py-1 rounded-full text-sm ${
                          emp.role === 'manager' 
                            ? 'bg-blue-100 text-blue-700' 
                            : emp.role === 'cluster_head'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-green-100 text-green-700'
                        }`}>
                          {emp.role === 'manager' ? 'Manager' : emp.role === 'cluster_head' ? 'Cluster Head' : 'Employee'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-3 py-1 rounded-full text-sm ${
                          emp.employmentType === 'fulltime'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-orange-100 text-orange-700'
                        }`}>
                          {emp.employmentType === 'fulltime' ? 'Full-Time' : 'Contract'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                        {new Date(emp.joiningDate).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-3 py-1 rounded-full text-sm ${
                          emp.status === 'active'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {emp.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setSelectedEmployee(emp)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="View Details"
                          >
                            <FileText className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleDeleteEmployee(emp.employeeId)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleEditEmployee(emp)}
                            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Employee Details Modal */}
        {selectedEmployee && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-pink-600 text-white p-6 rounded-t-xl">
                <h2 className="text-2xl">Employee Details</h2>
              </div>

              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Employee ID</p>
                    <p className="text-gray-900">{selectedEmployee.employeeId}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Name</p>
                    <p className="text-gray-900">{selectedEmployee.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Email</p>
                    <p className="text-gray-900">{selectedEmployee.email}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Role</p>
                    <p className="text-gray-900">{selectedEmployee.role}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Employment Type</p>
                    <p className="text-gray-900">{selectedEmployee.employmentType}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Joining Date</p>
                    <p className="text-gray-900">{new Date(selectedEmployee.joiningDate).toLocaleDateString()}</p>
                  </div>
                  {selectedEmployee.dob && (
                    <div>
                      <p className="text-sm text-gray-600">Date of Birth</p>
                      <p className="text-gray-900">{new Date(selectedEmployee.dob).toLocaleDateString()}</p>
                    </div>
                  )}
                  {selectedEmployee.phone && (
                    <div>
                      <p className="text-sm text-gray-600">Phone</p>
                      <p className="text-gray-900">{selectedEmployee.phone}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-gray-600">Status</p>
                    <p className="text-gray-900">{selectedEmployee.status}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Created By</p>
                    <p className="text-gray-900">{selectedEmployee.createdBy}</p>
                  </div>
                </div>

                {/* Aadhar Images */}
                {selectedEmployee.aadharFront && (
                  <div>
                    <p className="text-sm text-gray-600 mb-2">Aadhar Card (Front)</p>
                    <img 
                      src={selectedEmployee.aadharFront} 
                      alt="Aadhar Front" 
                      className="w-full rounded-lg border border-gray-300"
                    />
                  </div>
                )}
                {selectedEmployee.aadharBack && (
                  <div>
                    <p className="text-sm text-gray-600 mb-2">Aadhar Card (Back)</p>
                    <img 
                      src={selectedEmployee.aadharBack} 
                      alt="Aadhar Back" 
                      className="w-full rounded-lg border border-gray-300"
                    />
                  </div>
                )}

                <button
                  onClick={() => setSelectedEmployee(null)}
                  className="w-full bg-gray-200 text-gray-700 py-3 rounded-lg hover:bg-gray-300 transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Employee Account Setup Modal */}
        {showAccountSetup && (
          <EmployeeAccountSetup
            onClose={() => setShowAccountSetup(false)}
            employees={employees.filter(emp => emp.status === 'active')}
          />
        )}
          </>
        )}
      </div>
    </div>
  );
}