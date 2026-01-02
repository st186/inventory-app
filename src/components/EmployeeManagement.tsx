import { useState, useEffect } from 'react';
import { Users, UserPlus, Search, Edit2, Trash2, Calendar, DollarSign, FileText, Upload, KeyRound, RefreshCw, UserCog, AlertCircle, Store, Key, Clock } from 'lucide-react';
import * as api from '../utils/api';
import { EmployeeAccountSetup } from './EmployeeAccountSetup';
import { HierarchyManagement } from './HierarchyManagement';
import { EmployeeDetailsModal } from './EmployeeDetailsModal';
import { PayrollManagement } from './PayrollManagement';
import { AttendancePortal } from './AttendancePortal';

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
  storeId?: string; // Store assignment
  designation?: 'store_incharge' | 'production_incharge' | null; // Department head designation
  department?: 'store_operations' | 'production' | null; // Which department
  inchargeId?: string; // For employees under an incharge
}

interface EmployeeManagementProps {
  user: {
    role: string;
    email: string;
    employeeId?: string;
    name: string;
    storeId?: string | null;
    accessToken?: string;
  };
  selectedStoreId?: string | null;
}

export function EmployeeManagement({ user, selectedStoreId }: EmployeeManagementProps) {
  const [activeTab, setActiveTab] = useState<'employees' | 'hierarchy' | 'payroll' | 'attendance'>('employees');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [archivedEmployees, setArchivedEmployees] = useState<any[]>([]);
  const [showPastEmployees, setShowPastEmployees] = useState(false);
  const [stores, setStores] = useState<api.Store[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [showAccountSetup, setShowAccountSetup] = useState(false);
  const [showMigrationStatus, setShowMigrationStatus] = useState(false);
  const [migrationResult, setMigrationResult] = useState<any>(null);
  const [aadharFront, setAadharFront] = useState('');
  const [aadharBack, setAadharBack] = useState('');
  const [showAssignManager, setShowAssignManager] = useState(false);
  const [assigningManagerTo, setAssigningManagerTo] = useState<Employee | null>(null);
  const [selectedManagerForAssignment, setSelectedManagerForAssignment] = useState('');
  const [selectedSupervisorType, setSelectedSupervisorType] = useState<'manager' | 'incharge'>('manager');
  const [managers, setManagers] = useState<Employee[]>([]);
  const [incharges, setIncharges] = useState<Employee[]>([]);
  const [showEditRole, setShowEditRole] = useState(false);
  const [editingRoleFor, setEditingRoleFor] = useState<Employee | null>(null);
  const [selectedNewRole, setSelectedNewRole] = useState<'employee' | 'manager' | 'cluster_head'>('employee');
  const [showChangeStore, setShowChangeStore] = useState(false);
  const [changingStoreFor, setChangingStoreFor] = useState<Employee | null>(null);
  const [selectedNewStore, setSelectedNewStore] = useState('');
  const [showDesignationModal, setShowDesignationModal] = useState(false);
  const [editingDesignationFor, setEditingDesignationFor] = useState<Employee | null>(null);
  const [showAssignDesignation, setShowAssignDesignation] = useState(false);
  const [assigningDesignationTo, setAssigningDesignationTo] = useState<Employee | null>(null);
  const [selectedDesignation, setSelectedDesignation] = useState<'none' | 'store_incharge' | 'production_incharge'>('none');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resettingPasswordFor, setResettingPasswordFor] = useState<Employee | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'employee' as 'manager' | 'employee' | 'cluster_head',
    employmentType: 'fulltime' as 'fulltime' | 'contract',
    joiningDate: new Date().toISOString().split('T')[0],
    dob: '',
    phone: '',
    storeId: user.storeId || '' as string, // Auto-set to manager's store
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
    if (isClusterHead) {
      loadStores();
    }
  }, [selectedStoreId]); // Reload when store changes

  const loadStores = async () => {
    try {
      const data = await api.getStores();
      setStores(data);
    } catch (error) {
      // Silently handle authentication errors (user not logged in yet)
      if (error instanceof Error && 
          (error.message === 'Not authenticated' || error.message === 'Unauthorized')) {
        return;
      }
      console.error('Error loading stores:', error);
    }
  };

  const loadEmployees = async () => {
    try {
      setLoading(true);
      let data: Employee[];
      
      // Load employees based on user role using the appropriate API endpoint
      if (isManager && user.employeeId) {
        // Managers: Use manager-specific endpoint
        console.log('📋 Loading employees for manager:', user.employeeId);
        data = await api.getEmployeesByManager(user.employeeId);
        console.log('✅ Loaded employees:', data);
      } else if (isClusterHead) {
        // Cluster heads: Load all employees
        console.log('📋 Loading all employees for cluster head');
        data = await api.getAllEmployees();
        
        // If a specific store is selected, filter by that store (include null/undefined storeIds for backward compatibility)
        if (selectedStoreId) {
          data = data.filter((emp: any) => 
            emp.storeId === selectedStoreId || 
            emp.storeId === null || 
            emp.storeId === undefined
          );
        }
      } else {
        // Fallback: load all
        data = await api.getAllEmployees();
      }
      
      setEmployees(data);
      
      // Also load archived employees
      try {
        const archived = await api.getArchivedEmployees();
        setArchivedEmployees(archived);
      } catch (archiveError) {
        console.error('Error loading archived employees:', archiveError);
        // Don't alert for archived employees error - non-critical
      }
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
        // Employees inherit their manager's store
        if (isManager && user.storeId) {
          employeeData.storeId = user.storeId;
        }
      } else if (formData.role === 'manager') {
        employeeData.clusterHeadId = user.employeeId; // Manager reports to current user (cluster head)
        // Managers get assigned to specific store by cluster head
        if (formData.storeId) {
          employeeData.storeId = formData.storeId;
        }
      }

      // Add Aadhar if uploaded
      if (aadharFront) employeeData.aadharFront = aadharFront;
      if (aadharBack) employeeData.aadharBack = aadharBack;

      await api.createUnifiedEmployee(employeeData);
      
      alert(`✅ Employee created successfully!
      
Employee ID: ${employeeId}
Name: ${formData.name}
Email: ${formData.email}
Password: ${formData.password}

⚠️ IMPORTANT: Save these credentials!
The employee can now login with their email and password.`);
      
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
        storeId: user.storeId || '' as string, // Auto-set to manager's store
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

  const handleResetPassword = async () => {
    if (!resettingPasswordFor || !newPassword) {
      alert('Please enter a new password');
      return;
    }

    try {
      setLoading(true);
      const result = await api.resetEmployeePassword(resettingPasswordFor.employeeId, newPassword);
      
      alert(`✅ Password reset successfully!

Employee: ${result.credentials.employeeId} - ${resettingPasswordFor.name}
Email: ${result.credentials.email}
New Password: ${result.credentials.password}

⚠️ IMPORTANT: Save these credentials and share them with the employee!`);
      
      setShowResetPassword(false);
      setResettingPasswordFor(null);
      setNewPassword('');
    } catch (error) {
      console.error('Error resetting password:', error);
      alert('Failed to reset password: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
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

  const handleMigrateStores = async () => {
    if (!confirm('This will assign storeIds to all employees based on their manager\'s store. Continue?')) {
      return;
    }

    try {
      setLoading(true);
      const result = await api.migrateEmployeeStores();
      setMigrationResult(result);
      setShowMigrationStatus(true);
      await loadEmployees(); // Reload to show updated data
    } catch (error) {
      console.error('Error running migration:', error);
      alert(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncDesignations = async () => {
    if (!confirm('This will sync all employee designations (Store Incharge/Production Incharge) to their auth accounts. This ensures incharges can access their full features when they log in. Continue?')) {
      return;
    }

    try {
      setLoading(true);
      const result = await api.syncDesignations();
      alert(`✅ Successfully synced ${result.synced} employee designations!\n\n${result.skipped > 0 ? `Skipped ${result.skipped} employees (no designation or no auth account)` : ''}\n\n🔄 Store incharges should now log out and log back in to see their full features.`);
      await loadEmployees(); // Reload to show updated data
    } catch (error) {
      console.error('Error syncing designations:', error);
      alert(`Sync failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAssignManager = async (emp: Employee) => {
    // Load all managers and incharges when opening the modal
    try {
      const allEmployees = await api.getAllEmployees();
      const managersList = allEmployees.filter((e: Employee) => e.role === 'manager');
      const inchargesList = allEmployees.filter((e: Employee) => 
        e.designation === 'store_incharge' || e.designation === 'production_incharge'
      );
      setManagers(managersList);
      setIncharges(inchargesList);
      setAssigningManagerTo(emp);
      
      // Determine current supervisor type
      if (emp.inchargeId) {
        setSelectedSupervisorType('incharge');
        setSelectedManagerForAssignment(emp.inchargeId);
      } else {
        setSelectedSupervisorType('manager');
        setSelectedManagerForAssignment(emp.managerId || '');
      }
      
      setShowAssignManager(true);
    } catch (error) {
      console.error('Error loading managers:', error);
      alert('Failed to load managers');
    }
  };

  const handleAssignManager = async () => {
    if (!assigningManagerTo || !selectedManagerForAssignment) {
      alert('Please select a supervisor');
      return;
    }

    try {
      setLoading(true);
      
      // Call the API based on supervisor type
      if (selectedSupervisorType === 'incharge') {
        await api.assignInchargeToEmployee(assigningManagerTo.employeeId, selectedManagerForAssignment);
        alert(`Incharge assigned successfully! Employee has been assigned to their department.`);
      } else {
        await api.assignManagerToEmployee(assigningManagerTo.employeeId, selectedManagerForAssignment);
        alert(`Operations Manager assigned successfully! Employee's store has been updated to match their new manager.`);
      }
      
      setShowAssignManager(false);
      setAssigningManagerTo(null);
      setSelectedManagerForAssignment('');
      await loadEmployees(); // Reload to show updated data
    } catch (error) {
      console.error('Error assigning supervisor:', error);
      alert(`Failed to assign supervisor: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const getManagerName = (managerId?: string) => {
    if (!managerId) return 'No manager assigned';
    const allEmp = employees.find((e: Employee) => e.employeeId === managerId);
    return allEmp ? `${allEmp.name} (${allEmp.employeeId})` : `Manager ${managerId}`;
  };

  const handleOpenEditRole = (emp: Employee) => {
    setEditingRoleFor(emp);
    setSelectedNewRole(emp.role as 'employee' | 'manager' | 'cluster_head');
    setShowEditRole(true);
  };

  const handleUpdateRole = async () => {
    if (!editingRoleFor) return;

    try {
      setLoading(true);
      await api.updateEmployeeRole(editingRoleFor.employeeId, selectedNewRole);
      
      alert(`Role updated successfully from "${editingRoleFor.role}" to "${selectedNewRole}"!`);
      setShowEditRole(false);
      setEditingRoleFor(null);
      await loadEmployees(); // Reload to show updated data
    } catch (error) {
      console.error('Error updating role:', error);
      alert(`Failed to update role: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChangeStore = (emp: Employee) => {
    setChangingStoreFor(emp);
    setSelectedNewStore(emp.storeId || '');
    setShowChangeStore(true);
  };

  const handleChangeStore = async () => {
    if (!changingStoreFor || !selectedNewStore) return;

    try {
      setLoading(true);
      await api.updateEmployeeStore(changingStoreFor.employeeId, selectedNewStore);
      
      // Get store name for the message
      const storeName = stores.find(s => s.id === selectedNewStore)?.name || selectedNewStore;
      alert(`Store updated successfully! ${changingStoreFor.name} is now assigned to ${storeName}`);
      setShowChangeStore(false);
      setChangingStoreFor(null);
      await loadEmployees(); // Reload to show updated data
    } catch (error) {
      console.error('Error updating store:', error);
      alert(`Failed to update store: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAssignDesignation = (emp: Employee) => {
    setAssigningDesignationTo(emp);
    // Set current designation
    if (emp.designation === 'store_incharge') {
      setSelectedDesignation('store_incharge');
    } else if (emp.designation === 'production_incharge') {
      setSelectedDesignation('production_incharge');
    } else {
      setSelectedDesignation('none');
    }
    setShowAssignDesignation(true);
  };

  const handleAssignDesignation = async () => {
    if (!assigningDesignationTo) return;

    try {
      setLoading(true);
      const designation = selectedDesignation === 'none' ? null : selectedDesignation;
      const department = selectedDesignation === 'store_incharge' 
        ? 'store_operations' 
        : selectedDesignation === 'production_incharge'
        ? 'production'
        : null;
      
      await api.updateEmployeeDesignation(
        assigningDesignationTo.employeeId, 
        designation, 
        department
      );
      
      const roleText = selectedDesignation === 'store_incharge' 
        ? 'Store Incharge' 
        : selectedDesignation === 'production_incharge'
        ? 'Production Incharge'
        : 'Regular Employee';
        
      alert(`Designation updated! ${assigningDesignationTo.name} is now ${roleText}`);
      setShowAssignDesignation(false);
      setAssigningDesignationTo(null);
      await loadEmployees(); // Reload to show updated data
    } catch (error) {
      console.error('Error updating designation:', error);
      alert(`Failed to update designation: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
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
            <button
              onClick={() => setActiveTab('payroll')}
              className={`flex-1 px-6 py-4 text-center transition-colors ${
                activeTab === 'payroll'
                  ? 'border-b-2 border-purple-600 text-purple-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <DollarSign className="w-5 h-5" />
                <span>Payroll</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('attendance')}
              className={`flex-1 px-6 py-4 text-center transition-colors ${
                activeTab === 'attendance'
                  ? 'border-b-2 border-purple-600 text-purple-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Clock className="w-5 h-5" />
                <span>Attendance</span>
              </div>
            </button>
          </div>
        </div>

        {/* Conditional Rendering based on Active Tab */}
        {activeTab === 'hierarchy' ? (
          <HierarchyManagement 
            userRole={user.role as 'cluster_head' | 'manager' | 'employee'}
            selectedStoreId={selectedStoreId}
            accessToken={user.accessToken}
          />
        ) : activeTab === 'payroll' ? (
          <PayrollManagement 
            userRole={user.role as 'manager' | 'cluster_head'} 
            selectedDate={new Date().toISOString().split('T')[0]}
            userEmployeeId={user.employeeId}
            userName={user.name}
            selectedStoreId={selectedStoreId}
          />
        ) : activeTab === 'attendance' ? (
          <AttendancePortal 
            user={{
              employeeId: user.employeeId,
              name: user.name,
              email: user.email,
              role: user.role
            }}
            selectedStoreId={selectedStoreId}
          />
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
                <>
                  <button
                    onClick={() => setShowAccountSetup(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-all"
                  >
                    <KeyRound className="w-5 h-5" />
                    Create Login Accounts
                  </button>
                  <button
                    onClick={handleMigrateStores}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-teal-600 text-white rounded-lg hover:shadow-lg transition-all disabled:opacity-50"
                    title="Assign store IDs to existing employees based on their manager's store"
                  >
                    <RefreshCw className="w-5 h-5" />
                    Migrate Stores
                  </button>
                  <button
                    onClick={handleSyncDesignations}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-lg hover:shadow-lg transition-all disabled:opacity-50"
                    title="Sync employee designations to auth accounts so incharges can access their full features"
                  >
                    <UserCog className="w-5 h-5" />
                    Sync Designations
                  </button>
                </>
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

                {/* Store Assignment (Cluster Head Only for managers, Auto-assigned for employees under manager) */}
                {isClusterHead && formData.role === 'manager' && (
                  <div>
                    <label className="block text-sm text-gray-700 mb-2">Assign to Store *</label>
                    <select
                      value={formData.storeId}
                      onChange={(e) => setFormData({ ...formData, storeId: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    >
                      <option value="">Select a store...</option>
                      {stores.map((store) => (
                        <option key={store.id} value={store.id}>
                          {store.name} {store.location && `- ${store.location}`}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      Manager will be assigned to this store
                    </p>
                  </div>
                )}

                {/* Store info for managers creating employees */}
                {isManager && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-sm text-blue-800">
                      📍 Employee will be assigned to your store automatically
                    </p>
                  </div>
                )}

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
                        storeId: user.storeId || '' as string, // Auto-set to manager's store
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
                  {isClusterHead && <th className="px-6 py-3 text-left text-xs text-gray-700 uppercase tracking-wider">Store</th>}
                  {isClusterHead && <th className="px-6 py-3 text-left text-xs text-gray-700 uppercase tracking-wider">Designation</th>}
                  <th className="px-6 py-3 text-left text-xs text-gray-700 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-left text-xs text-gray-700 uppercase tracking-wider">Joining Date</th>
                  <th className="px-6 py-3 text-left text-xs text-gray-700 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs text-gray-700 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={isClusterHead ? 10 : 8} className="px-6 py-8 text-center text-gray-500">
                      Loading employees...
                    </td>
                  </tr>
                ) : (() => {
                  // Filter employees based on search term
                  const filteredEmployees = employees.filter(emp => 
                    searchTerm === '' ||
                    emp.employeeId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    emp.email.toLowerCase().includes(searchTerm.toLowerCase())
                  );
                  
                  return filteredEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={isClusterHead ? 10 : 8} className="px-6 py-8 text-center text-gray-500">
                        {searchTerm ? 'No employees found matching your search' : 'No employees found'}
                      </td>
                    </tr>
                  ) : (
                    filteredEmployees.map((emp) => (
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
                      {isClusterHead && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          {emp.storeId ? (
                            <span className="text-sm text-gray-900">
                              {stores.find(s => s.id === emp.storeId)?.name || emp.storeId}
                            </span>
                          ) : (
                            <span className="text-sm text-red-600">No Store</span>
                          )}
                        </td>
                      )}
                      {isClusterHead && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          {emp.designation === 'operations_incharge' ? (
                            <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm">
                              Operations Incharge
                            </span>
                          ) : emp.designation === 'store_incharge' ? (
                            <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                              Store Incharge
                            </span>
                          ) : emp.designation === 'production_incharge' ? (
                            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                              Production Incharge
                            </span>
                          ) : emp.designation === 'store_ops' ? (
                            <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs">
                              Store Ops
                            </span>
                          ) : emp.designation === 'production_ops' ? (
                            <span className="px-2 py-1 bg-green-50 text-green-600 rounded text-xs">
                              Production Ops
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">—</span>
                          )}
                        </td>
                      )}
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
                            title="Edit Full Profile"
                          >
                            <Edit2 className="w-5 h-5" />
                          </button>
                          {isClusterHead && (
                            <button
                              onClick={() => {
                                setEditingDesignationFor(emp);
                                setShowDesignationModal(true);
                              }}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Edit Role & Designation"
                            >
                              <UserCog className="w-5 h-5" />
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setResettingPasswordFor(emp);
                              setShowResetPassword(true);
                            }}
                            className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                            title="Reset Password"
                          >
                            <Key className="w-5 h-5" />
                          </button>
                          {isClusterHead && emp.role === 'employee' && (
                            <button
                              onClick={() => handleOpenAssignManager(emp)}
                              className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                              title="Assign Supervisor (Manager or Incharge)"
                            >
                              <UserCog className="w-5 h-5" />
                            </button>
                          )}
                          {isClusterHead && emp.role !== 'cluster_head' && (
                            <button
                              onClick={() => handleOpenChangeStore(emp)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Change Store"
                            >
                              <Store className="w-5 h-5" />
                            </button>
                          )}
                          {isClusterHead && emp.role === 'employee' && (
                            <button
                              onClick={() => handleOpenAssignDesignation(emp)}
                              className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              title="Assign Designation (Store/Production Incharge)"
                            >
                              <UserCog className="w-5 h-5" />
                            </button>
                          )}
                          {isClusterHead && !['employee', 'manager', 'cluster_head'].includes(emp.role) && (
                            <button
                              onClick={() => handleOpenEditRole(emp)}
                              className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                              title="Fix Role (Invalid Role Detected)"
                            >
                              <AlertCircle className="w-5 h-5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    ))
                  );
                })()}
              </tbody>
            </table>
          </div>
        </div>

        {/* Past Employees Section */}
        {isClusterHead && archivedEmployees.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6 mt-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Clock className="w-6 h-6 text-gray-500" />
                <h3 className="text-xl text-gray-700">Past Employees ({archivedEmployees.length})</h3>
              </div>
              <button
                onClick={() => setShowPastEmployees(!showPastEmployees)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
              >
                {showPastEmployees ? 'Hide' : 'Show'}
              </button>
            </div>

            {showPastEmployees && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">
                        Employee ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">
                        Role
                      </th>
                      <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">
                        Joining Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">
                        Release Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">
                        Total Earnings
                      </th>
                      <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">
                        Duration
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {archivedEmployees.map((emp) => {
                      const joiningDate = new Date(emp.joiningDate || emp.createdAt);
                      const releaseDate = new Date(emp.releasedAt);
                      const durationMs = releaseDate.getTime() - joiningDate.getTime();
                      const durationDays = Math.floor(durationMs / (1000 * 60 * 60 * 24));
                      const years = Math.floor(durationDays / 365);
                      const months = Math.floor((durationDays % 365) / 30);
                      const days = durationDays % 30;
                      
                      let durationStr = '';
                      if (years > 0) durationStr += `${years}y `;
                      if (months > 0) durationStr += `${months}m `;
                      if (days > 0 || durationStr === '') durationStr += `${days}d`;

                      return (
                        <tr key={emp.employeeId} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm">
                              {emp.employeeId}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-gray-900">{emp.name}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-3 py-1 rounded-full text-sm ${
                              emp.role === 'manager' 
                                ? 'bg-blue-100 text-blue-700'
                                : emp.role === 'cluster_head'
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-green-100 text-green-700'
                            }`}>
                              {emp.role === 'cluster_head' ? 'Cluster Head' : emp.role.charAt(0).toUpperCase() + emp.role.slice(1)}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                            {new Date(emp.joiningDate || emp.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                            {releaseDate.toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-green-600">
                              ₹{emp.totalEarnings?.toLocaleString() || '0'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                            {durationStr.trim()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

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
                  {selectedEmployee.designation && (
                    <div>
                      <p className="text-sm text-gray-600">Designation</p>
                      <p className="text-gray-900">
                        {selectedEmployee.designation === 'store_incharge' ? 'Store Incharge' : 'Production Incharge'}
                      </p>
                    </div>
                  )}
                  {selectedEmployee.department && (
                    <div>
                      <p className="text-sm text-gray-600">Department</p>
                      <p className="text-gray-900">
                        {selectedEmployee.department === 'store_operations' ? 'Store Operations' : 'Production'}
                      </p>
                    </div>
                  )}
                  {selectedEmployee.managerId && (
                    <div>
                      <p className="text-sm text-gray-600">Reports To (Manager)</p>
                      <p className="text-gray-900">{getManagerName(selectedEmployee.managerId)}</p>
                    </div>
                  )}
                  {selectedEmployee.inchargeId && (
                    <div>
                      <p className="text-sm text-gray-600">Reports To (Incharge)</p>
                      <p className="text-gray-900">{getManagerName(selectedEmployee.inchargeId)}</p>
                    </div>
                  )}
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

        {/* Migration Status Modal */}
        {showMigrationStatus && migrationResult && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-gradient-to-r from-green-600 to-teal-600 text-white p-6 rounded-t-xl">
                <h2 className="text-2xl">Store Migration Complete</h2>
              </div>

              <div className="p-6 space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                  <h3 className="text-lg text-green-900 mb-2">Migration Summary</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-green-700">Total Employees</p>
                      <p className="text-2xl text-green-900">{migrationResult.summary.total}</p>
                    </div>
                    <div>
                      <p className="text-sm text-green-700">✓ Updated</p>
                      <p className="text-2xl text-green-900">{migrationResult.summary.updated}</p>
                    </div>
                    <div>
                      <p className="text-sm text-green-700">— Skipped</p>
                      <p className="text-2xl text-green-900">{migrationResult.summary.skipped}</p>
                    </div>
                    <div>
                      <p className="text-sm text-yellow-700">⚠ Needs Manual</p>
                      <p className="text-2xl text-yellow-900">{migrationResult.summary.needsManualAssignment || 0}</p>
                    </div>
                    {migrationResult.summary.errors > 0 && (
                      <div className="col-span-2">
                        <p className="text-sm text-red-700">✗ Errors</p>
                        <p className="text-2xl text-red-900">{migrationResult.summary.errors}</p>
                      </div>
                    )}
                  </div>
                </div>

                {migrationResult.updates && migrationResult.updates.length > 0 && (
                  <div>
                    <h3 className="text-lg text-gray-900 mb-3">✓ Successfully Updated</h3>
                    <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg">
                      <table className="w-full">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-4 py-2 text-left text-sm text-gray-700">ID</th>
                            <th className="px-4 py-2 text-left text-sm text-gray-700">Name</th>
                            <th className="px-4 py-2 text-left text-sm text-gray-700">Role</th>
                            <th className="px-4 py-2 text-left text-sm text-gray-700">Store ID</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {migrationResult.updates.map((update: any, index: number) => (
                            <tr key={index} className="hover:bg-gray-50">
                              <td className="px-4 py-2 text-sm text-gray-900">{update.employeeId}</td>
                              <td className="px-4 py-2 text-sm text-gray-900">{update.name}</td>
                              <td className="px-4 py-2 text-sm text-gray-600">{update.role}</td>
                              <td className="px-4 py-2 text-sm text-blue-600">{update.assignedStoreId}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {migrationResult.manualAssignmentNeeded && migrationResult.manualAssignmentNeeded.length > 0 && (
                  <div>
                    <h3 className="text-lg text-gray-900 mb-3">⚠ Needs Manual Store Assignment</h3>
                    <div className="max-h-60 overflow-y-auto border border-yellow-200 rounded-lg bg-yellow-50">
                      <table className="w-full">
                        <thead className="bg-yellow-100 sticky top-0">
                          <tr>
                            <th className="px-4 py-2 text-left text-sm text-yellow-900">ID</th>
                            <th className="px-4 py-2 text-left text-sm text-yellow-900">Name</th>
                            <th className="px-4 py-2 text-left text-sm text-yellow-900">Role</th>
                            <th className="px-4 py-2 text-left text-sm text-yellow-900">Reason</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-yellow-200">
                          {migrationResult.manualAssignmentNeeded.map((item: any, index: number) => (
                            <tr key={index} className="hover:bg-yellow-100">
                              <td className="px-4 py-2 text-sm text-gray-900">{item.employeeId}</td>
                              <td className="px-4 py-2 text-sm text-gray-900">{item.name}</td>
                              <td className="px-4 py-2 text-sm text-gray-600">{item.role}</td>
                              <td className="px-4 py-2 text-sm text-yellow-800">{item.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                      <p className="text-sm text-yellow-800">
                        💡 <strong>Action Required:</strong> Go to Store Management to assign stores to managers, or assign managers to employees who don't have one.
                      </p>
                    </div>
                  </div>
                )}

                {migrationResult.errorDetails && migrationResult.errorDetails.length > 0 && (
                  <div>
                    <h3 className="text-lg text-gray-900 mb-3">✗ Errors</h3>
                    <div className="max-h-60 overflow-y-auto border border-red-200 rounded-lg bg-red-50">
                      <table className="w-full">
                        <thead className="bg-red-100 sticky top-0">
                          <tr>
                            <th className="px-4 py-2 text-left text-sm text-red-900">ID</th>
                            <th className="px-4 py-2 text-left text-sm text-red-900">Name</th>
                            <th className="px-4 py-2 text-left text-sm text-red-900">Role</th>
                            <th className="px-4 py-2 text-left text-sm text-red-900">Error</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-red-200">
                          {migrationResult.errorDetails.map((item: any, index: number) => (
                            <tr key={index} className="hover:bg-red-100">
                              <td className="px-4 py-2 text-sm text-gray-900">{item.employeeId}</td>
                              <td className="px-4 py-2 text-sm text-gray-900">{item.name}</td>
                              <td className="px-4 py-2 text-sm text-gray-600">{item.role}</td>
                              <td className="px-4 py-2 text-sm text-red-800">{item.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setShowMigrationStatus(false)}
                  className="w-full bg-gradient-to-r from-green-600 to-teal-600 text-white py-3 rounded-lg hover:shadow-lg transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Assign Manager Modal */}
        {showAssignManager && assigningManagerTo && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
              <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-6 rounded-t-xl">
                <h2 className="text-2xl">Assign Supervisor</h2>
                <p className="text-sm text-purple-100 mt-1">
                  {assigningManagerTo.name} ({assigningManagerTo.employeeId})
                </p>
              </div>

              <div className="p-6 space-y-4">
                {/* Current Supervisor Info */}
                {(assigningManagerTo.managerId || assigningManagerTo.inchargeId) && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-sm text-blue-700 mb-1">Current Supervisor</p>
                    <p className="text-blue-900">
                      {assigningManagerTo.inchargeId 
                        ? `${getManagerName(assigningManagerTo.inchargeId)} (Incharge)`
                        : getManagerName(assigningManagerTo.managerId || '')}
                    </p>
                  </div>
                )}

                {/* Supervisor Type Selection */}
                <div>
                  <label className="block text-sm text-gray-700 mb-2">
                    Supervisor Type *
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="radio"
                        value="manager"
                        checked={selectedSupervisorType === 'manager'}
                        onChange={(e) => {
                          setSelectedSupervisorType(e.target.value as 'manager' | 'incharge');
                          setSelectedManagerForAssignment('');
                        }}
                        className="mr-2"
                      />
                      <span className="text-sm text-gray-700">Operations Manager</span>
                    </label>
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="radio"
                        value="incharge"
                        checked={selectedSupervisorType === 'incharge'}
                        onChange={(e) => {
                          setSelectedSupervisorType(e.target.value as 'manager' | 'incharge');
                          setSelectedManagerForAssignment('');
                        }}
                        className="mr-2"
                      />
                      <span className="text-sm text-gray-700">Store/Production Incharge</span>
                    </label>
                  </div>
                </div>

                {/* Select Supervisor */}
                <div>
                  <label className="block text-sm text-gray-700 mb-2">
                    Select {selectedSupervisorType === 'manager' ? 'Operations Manager' : 'Incharge'} *
                  </label>
                  <select
                    value={selectedManagerForAssignment}
                    onChange={(e) => setSelectedManagerForAssignment(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="">Select {selectedSupervisorType === 'manager' ? 'a manager' : 'an incharge'}...</option>
                    {selectedSupervisorType === 'manager' ? (
                      managers.map((manager) => (
                        <option key={manager.employeeId} value={manager.employeeId}>
                          {manager.name} ({manager.employeeId})
                          {manager.storeId ? ` - Store: ${manager.storeId}` : ' - No store assigned'}
                        </option>
                      ))
                    ) : (
                      incharges.map((incharge) => (
                        <option key={incharge.employeeId} value={incharge.employeeId}>
                          {incharge.name} ({incharge.employeeId}) - {incharge.designation === 'store_incharge' ? 'Store Incharge' : 'Production Incharge'}
                        </option>
                      ))
                    )}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    💡 {selectedSupervisorType === 'manager' 
                      ? "Employee's store will be automatically updated to match their manager's store"
                      : "Employee will be assigned to the incharge's department"}
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleAssignManager}
                    disabled={loading || !selectedManagerForAssignment}
                    className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-3 rounded-lg hover:shadow-lg transition-all disabled:opacity-50"
                  >
                    {loading ? 'Assigning...' : 'Assign Supervisor'}
                  </button>
                  <button
                    onClick={() => {
                      setShowAssignManager(false);
                      setAssigningManagerTo(null);
                      setSelectedManagerForAssignment('');
                      setSelectedSupervisorType('manager');
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

        {/* Edit Role Modal */}
        {showEditRole && editingRoleFor && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
              <div className="sticky top-0 bg-gradient-to-r from-orange-600 to-red-600 text-white p-6 rounded-t-xl">
                <h2 className="text-2xl">Fix Employee Role</h2>
                <p className="text-sm text-orange-100 mt-1">
                  {editingRoleFor.name} ({editingRoleFor.employeeId})
                </p>
              </div>

              <div className="p-6 space-y-4">
                {/* Current Role Warning */}
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-orange-600 mt-0.5" />
                    <div>
                      <p className="text-sm text-orange-800 mb-1">
                        <strong>Invalid Role Detected:</strong> "{editingRoleFor.role}"
                      </p>
                      <p className="text-xs text-orange-700">
                        This role is not recognized by the system. Please select a valid role below.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Select New Role */}
                <div>
                  <label className="block text-sm text-gray-700 mb-2">
                    Select Correct Role *
                  </label>
                  <select
                    value={selectedNewRole}
                    onChange={(e) => setSelectedNewRole(e.target.value as 'employee' | 'manager' | 'cluster_head')}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  >
                    <option value="employee">Employee - Regular staff (can be fulltime or contract)</option>
                    <option value="manager">Manager - Manages employees and a store</option>
                    <option value="cluster_head">Cluster Head - Manages multiple stores</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-2">
                    💡 Most workers (kitchen staff, delivery, etc.) should be "Employee"
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleUpdateRole}
                    disabled={loading}
                    className="flex-1 bg-gradient-to-r from-orange-600 to-red-600 text-white py-3 rounded-lg hover:shadow-lg transition-all disabled:opacity-50"
                  >
                    {loading ? 'Updating...' : 'Update Role'}
                  </button>
                  <button
                    onClick={() => {
                      setShowEditRole(false);
                      setEditingRoleFor(null);
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

        {/* Change Store Modal */}
        {showChangeStore && changingStoreFor && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
              <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 rounded-t-xl">
                <h2 className="text-2xl">Change Employee Store</h2>
                <p className="text-sm text-blue-100 mt-1">
                  {changingStoreFor.name} ({changingStoreFor.employeeId})
                </p>
              </div>

              <div className="p-6 space-y-4">
                {/* Current Store Info */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Store className="w-5 h-5 text-blue-600 mt-0.5" />
                    <div>
                      <p className="text-sm text-blue-900 mb-1">
                        <strong>Current Store:</strong>{' '}
                        {changingStoreFor.storeId 
                          ? (stores.find(s => s.id === changingStoreFor.storeId)?.name || changingStoreFor.storeId)
                          : 'No store assigned'}
                      </p>
                      <p className="text-xs text-blue-700">
                        Select a new store below to reassign this employee.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Select New Store */}
                <div>
                  <label className="block text-sm text-gray-700 mb-2">
                    Select New Store *
                  </label>
                  <select
                    value={selectedNewStore}
                    onChange={(e) => setSelectedNewStore(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select a store...</option>
                    {stores.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name} - {store.location}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-2">
                    💡 This will update the employee's store assignment immediately
                  </p>
                </div>

                {/* Warning if changing from current store */}
                {selectedNewStore && selectedNewStore !== changingStoreFor.storeId && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <p className="text-xs text-yellow-800">
                      ⚠️ This will move the employee to a different store. Their manager assignment will remain unchanged.
                    </p>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleChangeStore}
                    disabled={loading || !selectedNewStore}
                    className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 rounded-lg hover:shadow-lg transition-all disabled:opacity-50"
                  >
                    {loading ? 'Updating...' : 'Update Store'}
                  </button>
                  <button
                    onClick={() => {
                      setShowChangeStore(false);
                      setChangingStoreFor(null);
                      setSelectedNewStore('');
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

        {/* Assign Designation Modal */}
        {showAssignDesignation && assigningDesignationTo && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
              <div className="sticky top-0 bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6 rounded-t-xl">
                <h2 className="text-2xl">Assign Employee Designation</h2>
                <p className="text-sm text-indigo-100 mt-1">
                  {assigningDesignationTo.name} ({assigningDesignationTo.employeeId})
                </p>
              </div>

              <div className="p-6 space-y-4">
                {/* Info Box */}
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <UserCog className="w-5 h-5 text-indigo-600 mt-0.5" />
                    <div>
                      <p className="text-sm text-indigo-900 mb-1">
                        <strong>Department Incharge Designations</strong>
                      </p>
                      <p className="text-xs text-indigo-700">
                        Assign employees as Store Incharge or Production Incharge. They will manage other employees in their department.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Current Designation Info */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-900">
                    <strong>Current Designation:</strong>{' '}
                    {assigningDesignationTo.designation === 'store_incharge' 
                      ? 'Store Incharge'
                      : assigningDesignationTo.designation === 'production_incharge'
                      ? 'Production Incharge'
                      : 'Regular Employee'}
                  </p>
                  {assigningDesignationTo.department && (
                    <p className="text-xs text-blue-700 mt-1">
                      Department: {assigningDesignationTo.department === 'store_operations' ? 'Store Operations' : 'Production'}
                    </p>
                  )}
                </div>

                {/* Select Designation */}
                <div>
                  <label className="block text-sm text-gray-700 mb-2">
                    Select Designation
                  </label>
                  <select
                    value={selectedDesignation}
                    onChange={(e) => setSelectedDesignation(e.target.value as 'none' | 'store_incharge' | 'production_incharge')}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="none">Regular Employee (No Designation)</option>
                    <option value="store_incharge">Store Incharge - Store Operations Department</option>
                    <option value="production_incharge">Production Incharge - Production Department</option>
                  </select>
                </div>

                {/* Role Description */}
                {selectedDesignation !== 'none' && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <p className="text-xs text-gray-700">
                      {selectedDesignation === 'store_incharge' && (
                        <>
                          <strong>Store Incharge Responsibilities:</strong><br />
                          • Customer-facing operations and administration<br />
                          • Manages Cashier, Kitchen Helper, Store Staff/Assistant<br />
                          • Reports to Operations Manager
                        </>
                      )}
                      {selectedDesignation === 'production_incharge' && (
                        <>
                          <strong>Production Incharge Responsibilities:</strong><br />
                          • Food preparation, quality control, production planning<br />
                          • Manages Momo Makers and production team<br />
                          • Reports to Operations Manager
                        </>
                      )}
                    </p>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleAssignDesignation}
                    disabled={loading}
                    className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 rounded-lg hover:shadow-lg transition-all disabled:opacity-50"
                  >
                    {loading ? 'Assigning...' : 'Assign Designation'}
                  </button>
                  <button
                    onClick={() => {
                      setShowAssignDesignation(false);
                      setAssigningDesignationTo(null);
                      setSelectedDesignation('none');
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

        {/* Reset Password Modal */}
        {showResetPassword && resettingPasswordFor && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
              <div className="sticky top-0 bg-gradient-to-r from-orange-600 to-red-600 text-white p-6 rounded-t-xl">
                <h2 className="text-2xl">Reset Password</h2>
                <p className="text-sm text-orange-100 mt-1">
                  {resettingPasswordFor.name} ({resettingPasswordFor.employeeId})
                </p>
              </div>

              <div className="p-6 space-y-4">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-sm text-yellow-800">
                    <strong>⚠️ Important:</strong> After resetting, save the new credentials and share them securely with the employee.
                  </p>
                </div>

                <div>
                  <label className="block text-sm text-gray-700 mb-2">Current Email</label>
                  <input
                    type="text"
                    value={resettingPasswordFor.email}
                    disabled
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-700 mb-2">New Password *</label>
                  <input
                    type="text"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="Enter new password"
                    autoFocus
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Minimum 6 characters. Use a strong, memorable password.
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleResetPassword}
                    disabled={loading || !newPassword}
                    className="flex-1 bg-gradient-to-r from-orange-600 to-red-600 text-white py-3 rounded-lg hover:shadow-lg transition-all disabled:opacity-50"
                  >
                    {loading ? 'Resetting...' : 'Reset Password'}
                  </button>
                  <button
                    onClick={() => {
                      setShowResetPassword(false);
                      setResettingPasswordFor(null);
                      setNewPassword('');
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
        
        {/* Employee Details Modal (for designation editing) */}
        {showDesignationModal && editingDesignationFor && (
          <EmployeeDetailsModal
            employee={editingDesignationFor}
            onClose={() => {
              setShowDesignationModal(false);
              setEditingDesignationFor(null);
            }}
            onSave={() => {
              loadEmployees(); // Reload employee list
            }}
          />
        )}
          </>
        )}
      </div>
    </div>
  );
}