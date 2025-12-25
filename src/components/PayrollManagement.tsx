import { useState, useEffect } from 'react';
import { Plus, Users, DollarSign, Calendar, X, Edit2, Trash2, UserPlus } from 'lucide-react';
import * as api from '../utils/api';
import { EmployeeAccountSetup } from './EmployeeAccountSetup';

interface Employee {
  id: string;
  employeeId: string;
  name: string;
  phone: string;
  type: 'contract' | 'fulltime';
  role?: string;
  dailyRate?: number;
  createdAt: string;
}

interface Payout {
  id: string;
  employeeId: string;
  employeeName: string;
  amount: number;
  date: string;
  createdAt: string;
}

interface PayrollManagementProps {
  userRole: 'manager' | 'cluster_head';
  selectedDate: string;
  userEmployeeId?: string | null;
  userName?: string;
}

export function PayrollManagement({ userRole, selectedDate, userEmployeeId, userName }: PayrollManagementProps) {
  const [activeTab, setActiveTab] = useState<'contract' | 'permanent' | 'my-payouts'>('contract');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  // Date range filter state
  const [viewMode, setViewMode] = useState<'current' | 'custom'>('current');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  
  // Calculate current month start and end dates
  const getCurrentMonthDates = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
      monthName: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    };
  };
  
  const currentMonth = getCurrentMonthDates();
  
  // Filter payouts based on selected date range
  const getFilteredPayouts = () => {
    if (viewMode === 'current') {
      // Show only current month payouts
      return payouts.filter(p => p.date >= currentMonth.start && p.date <= currentMonth.end);
    } else {
      // Show custom date range
      if (!customStartDate || !customEndDate) return [];
      return payouts.filter(p => p.date >= customStartDate && p.date <= customEndDate);
    }
  };
  
  const filteredPayouts = getFilteredPayouts();
  
  // Add employee modal state
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [newEmployee, setNewEmployee] = useState({
    name: '',
    phone: '',
    type: 'contract' as 'contract' | 'fulltime',
    role: '',
    dailyRate: ''
  });

  // Edit employee modal state
  const [showEditEmployee, setShowEditEmployee] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  // Payout modal state
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [payoutData, setPayoutData] = useState({
    employeeIds: [] as string[],
    amount: '',
    date: selectedDate
  });

  // Edit payout modal state
  const [showEditPayout, setShowEditPayout] = useState(false);
  const [editingPayout, setEditingPayout] = useState<Payout | null>(null);

  // Employee account setup modal state
  const [showAccountSetup, setShowAccountSetup] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      console.log('Loading employees and payouts from server...');
      const [employeesData, payoutsData] = await Promise.all([
        api.getEmployees(),
        api.getPayouts()
      ]);
      console.log('Loaded employees:', employeesData);
      console.log('Loaded payouts:', payoutsData);
      setEmployees(employeesData || []);
      setPayouts(payoutsData || []);
    } catch (error) {
      console.error('Error loading payroll data:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateEmployeeId = () => {
    const prefix = newEmployee.type === 'contract' ? 'CT' : 'FT';
    const timestamp = Date.now().toString().slice(-6);
    return `${prefix}${timestamp}`;
  };

  const handleAddEmployee = async () => {
    if (!newEmployee.name || !newEmployee.phone) {
      alert('Please fill in all required fields');
      return;
    }

    // Prevent managers from adding permanent employees
    if (userRole === 'manager' && newEmployee.type === 'fulltime') {
      alert('Managers can only add contract employees. Please contact your cluster head to add permanent employees.');
      return;
    }

    const employeeData: Employee = {
      id: crypto.randomUUID(),
      employeeId: generateEmployeeId(),
      name: newEmployee.name,
      phone: newEmployee.phone,
      type: newEmployee.type,
      role: newEmployee.role || undefined,
      dailyRate: newEmployee.dailyRate ? parseFloat(newEmployee.dailyRate) : undefined,
      createdAt: new Date().toISOString()
    };

    try {
      console.log('Adding employee:', employeeData);
      const result = await api.addEmployee(employeeData);
      console.log('Employee added, result:', result);
      
      // Reload data from server to ensure consistency
      await loadData();
      
      setShowAddEmployee(false);
      setNewEmployee({ name: '', phone: '', type: 'contract', role: '', dailyRate: '' });
      alert('Employee added successfully!');
    } catch (error) {
      console.error('Error adding employee:', error);
      alert('Failed to add employee');
    }
  };

  const handleAddPayout = async () => {
    if (payoutData.employeeIds.length === 0 || !payoutData.amount) {
      alert('Please select employees and enter amount');
      return;
    }

    if (submitting) return; // Prevent double submission

    try {
      setSubmitting(true);
      const newPayouts = payoutData.employeeIds.map(empId => {
        const employee = employees.find(e => e.id === empId);
        return {
          id: crypto.randomUUID(),
          employeeId: empId,
          employeeName: employee?.name || '',
          amount: parseFloat(payoutData.amount),
          date: payoutData.date,
          createdAt: new Date().toISOString()
        };
      });

      console.log('Adding payouts:', newPayouts);
      
      const result = await api.addPayouts(newPayouts);
      console.log('Payouts added successfully:', result);
      
      setPayouts([...payouts, ...newPayouts]);
      setShowPayoutModal(false);
      setPayoutData({ employeeIds: [], amount: '', date: selectedDate });
      alert('Payout added successfully!');
    } catch (error) {
      console.error('Error adding payout:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      alert(`Failed to add payout: ${errorMessage}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditEmployee = async () => {
    if (!editingEmployee) return;

    try {
      console.log('PayrollManagement: Updating employee:', editingEmployee);
      await api.updateEmployee(editingEmployee.id, editingEmployee);
      setEmployees(employees.map(e => e.id === editingEmployee.id ? editingEmployee : e));
      setShowEditEmployee(false);
      setEditingEmployee(null);
      alert('Employee updated successfully!');
    } catch (error) {
      console.error('PayrollManagement: Error updating employee:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to update employee: ${errorMessage}`);
    }
  };

  const handleDeleteEmployee = async (id: string) => {
    if (!confirm('Are you sure you want to delete this employee? This action cannot be undone.')) {
      return;
    }

    try {
      await api.deleteEmployee(id);
      setEmployees(employees.filter(e => e.id !== id));
      // Also delete associated payouts
      setPayouts(payouts.filter(p => p.employeeId !== id));
      alert('Employee deleted successfully!');
    } catch (error) {
      console.error('Error deleting employee:', error);
      alert('Failed to delete employee');
    }
  };

  const handleEditPayout = async () => {
    if (!editingPayout) return;

    try {
      await api.updatePayout(editingPayout.id, {
        amount: editingPayout.amount,
        date: editingPayout.date
      });
      setPayouts(payouts.map(p => p.id === editingPayout.id ? editingPayout : p));
      setShowEditPayout(false);
      setEditingPayout(null);
      alert('Payout updated successfully!');
    } catch (error) {
      console.error('Error updating payout:', error);
      alert('Failed to update payout');
    }
  };

  const handleDeletePayout = async (id: string) => {
    if (!confirm('Are you sure you want to delete this payout?')) {
      return;
    }

    try {
      await api.deletePayout(id);
      setPayouts(payouts.filter(p => p.id !== id));
      alert('Payout deleted successfully!');
    } catch (error) {
      console.error('Error deleting payout:', error);
      alert('Failed to delete payout');
    }
  };

  const calculateContractStats = () => {
    const contractEmployees = employees.filter(e => e.type === 'contract');
    const contractPayouts = filteredPayouts.filter(p => {
      const emp = employees.find(e => e.id === p.employeeId);
      return emp?.type === 'contract';
    });

    const totalPayout = contractPayouts.reduce((sum, p) => sum + p.amount, 0);
    const employeeWorkDays = contractEmployees.map(emp => {
      const empPayouts = contractPayouts.filter(p => p.employeeId === emp.id);
      const uniqueDays = new Set(empPayouts.map(p => p.date));
      return {
        ...emp,
        daysWorked: uniqueDays.size,
        totalPay: empPayouts.reduce((sum, p) => sum + p.amount, 0)
      };
    });

    const totalDaysWorked = employeeWorkDays.reduce((sum, e) => sum + e.daysWorked, 0);

    return { totalPayout, employeeWorkDays, totalDaysWorked };
  };

  const calculatePermanentStats = () => {
    const permanentEmployees = employees.filter(e => e.type === 'fulltime');
    const permanentPayouts = filteredPayouts.filter(p => {
      const emp = employees.find(e => e.id === p.employeeId);
      return emp?.type === 'fulltime';
    });

    const totalPayout = permanentPayouts.reduce((sum, p) => sum + p.amount, 0);
    const employeePayouts = permanentEmployees.map(emp => {
      const empPayouts = permanentPayouts.filter(p => p.employeeId === emp.id);
      return {
        ...emp,
        totalPaid: empPayouts.reduce((sum, p) => sum + p.amount, 0),
        lastPayout: empPayouts.length > 0 ? empPayouts[empPayouts.length - 1] : null
      };
    });

    return { totalPayout, employeePayouts };
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getAvatarColor = (index: number) => {
    const colors = [
      'bg-blue-500',
      'bg-purple-500',
      'bg-green-500',
      'bg-orange-500',
      'bg-pink-500',
      'bg-indigo-500'
    ];
    return colors[index % colors.length];
  };

  const contractStats = calculateContractStats();
  const permanentStats = calculatePermanentStats();

  const filteredEmployees = activeTab === 'contract'
    ? employees.filter(e => e.type === 'contract')
    : employees.filter(e => e.type === 'fulltime');

  // Check permissions for payout
  const canAddPayout = () => {
    if (activeTab === 'contract' && userRole === 'manager') return true;
    if (activeTab === 'permanent' && userRole === 'cluster_head') return true;
    return false;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-gray-500">Loading payroll data...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl text-gray-900 mb-2">Payroll Management</h1>
          <p className="text-gray-600">Manage and track employee payments</p>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-sm mb-6">
          <div className="border-b border-gray-200">
            <div className="flex gap-8 px-6">
              {/* My Payouts tab - for managers to see their own payroll */}
              {userRole === 'manager' && userEmployeeId && (
                <button
                  onClick={() => setActiveTab('my-payouts')}
                  className={`py-4 border-b-2 transition-colors ${
                    activeTab === 'my-payouts'
                      ? 'border-green-500 text-green-600'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  My Payouts
                </button>
              )}
              <button
                onClick={() => setActiveTab('contract')}
                className={`py-4 border-b-2 transition-colors ${
                  activeTab === 'contract'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Contract Employees
              </button>
              {/* Only show Permanent Employees tab for Cluster Heads */}
              {userRole === 'cluster_head' && (
                <button
                  onClick={() => setActiveTab('permanent')}
                  className={`py-4 border-b-2 transition-colors ${
                    activeTab === 'permanent'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Permanent Employees
                </button>
              )}
            </div>
          </div>

          {/* Action Buttons and Date Filter */}
          <div className="p-6 border-b border-gray-200 space-y-4">
            <div className="flex gap-4 flex-wrap">
              {/* Only show Add Employee button for contract tab or "My Payouts" doesn't have employees */}
              {activeTab !== 'permanent' && (
                <button
                  onClick={() => setShowAddEmployee(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Employee
                </button>
              )}
              
              {/* Add Payout button - shown based on permissions */}
              {canAddPayout() && (
                <button
                  onClick={() => setShowPayoutModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <DollarSign className="w-4 h-4" />
                  Add Payout
                </button>
              )}
            </div>
            
            {/* Date Range Filter */}
            <div className="bg-gradient-to-br from-[#E8D5F2] to-[#D4B5F0] rounded-lg p-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-purple-700" />
                  <span className="text-gray-900">View Period:</span>
                </div>
                
                <div className="flex gap-2">
                  <button
                    onClick={() => setViewMode('current')}
                    className={`px-4 py-2 rounded-lg transition-colors ${
                      viewMode === 'current'
                        ? 'bg-purple-600 text-white'
                        : 'bg-white text-gray-700 hover:bg-purple-50'
                    }`}
                  >
                    Current Month
                  </button>
                  <button
                    onClick={() => setViewMode('custom')}
                    className={`px-4 py-2 rounded-lg transition-colors ${
                      viewMode === 'custom'
                        ? 'bg-purple-600 text-white'
                        : 'bg-white text-gray-700 hover:bg-purple-50'
                    }`}
                  >
                    Custom Range
                  </button>
                </div>
                
                {viewMode === 'current' ? (
                  <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg">
                    <span className="text-gray-900 font-medium">{currentMonth.monthName}</span>
                  </div>
                ) : (
                  <div className="flex gap-2 items-center flex-wrap">
                    <div className="flex items-center gap-2">
                      <label className="text-gray-700 text-sm font-medium">From:</label>
                      <input
                        type="date"
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-gray-700 text-sm font-medium">To:</label>
                      <input
                        type="date"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Contract Employees Tab */}
          {activeTab === 'contract' && (() => {
            const contractEmployees = employees.filter(e => e.type === 'contract');
            const contractPayouts = filteredPayouts.filter(p => {
              const emp = employees.find(e => e.id === p.employeeId);
              return emp?.type === 'contract';
            });

            console.log('Rendering contract tab');
            console.log('Total employees:', employees.length);
            console.log('Contract employees:', contractEmployees.length, contractEmployees);
            console.log('Contract payouts:', contractPayouts.length, contractPayouts);

            const totalPayout = contractPayouts.reduce((sum, p) => sum + p.amount, 0);

            return (
              <div className="p-6">
                {/* Employees Section */}
                <div className="mb-8">
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h2 className="text-xl text-gray-900 mb-1">Contract Employees</h2>
                      <p className="text-sm text-gray-600">Daily rate workers</p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-600 mb-1">Total Employees</div>
                      <div className="text-2xl text-blue-600">{contractEmployees.length}</div>
                    </div>
                  </div>

                  {contractEmployees.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg">
                      <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>No contract employees yet</p>
                      <p className="text-sm mt-2">Click "Add Employee" to get started</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {contractEmployees.map((emp, index) => {
                        const empPayouts = contractPayouts.filter(p => p.employeeId === emp.id);
                        const totalPaid = empPayouts.reduce((sum, p) => sum + p.amount, 0);
                        const daysWorked = new Set(empPayouts.map(p => p.date)).size;

                        return (
                          <div key={emp.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <div className={`w-12 h-12 rounded-full ${getAvatarColor(index)} flex items-center justify-center text-white`}>
                                  {getInitials(emp.name)}
                                </div>
                                <div>
                                  <div className="text-gray-900">{emp.name}</div>
                                  <div className="text-xs text-gray-500">{emp.employeeId}</div>
                                </div>
                              </div>
                              <div className="flex gap-1">
                                <button
                                  onClick={() => {
                                    setEditingEmployee(emp);
                                    setShowEditEmployee(true);
                                  }}
                                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                  title="Edit employee"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteEmployee(emp.id)}
                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                                  title="Delete employee"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            {emp.role && (
                              <div className="mb-2">
                                <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs">
                                  {emp.role}
                                </span>
                              </div>
                            )}

                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-600">Phone:</span>
                                <span className="text-gray-900">{emp.phone}</span>
                              </div>
                              {emp.dailyRate && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Daily Rate:</span>
                                  <span className="text-green-600">₹{emp.dailyRate}</span>
                                </div>
                              )}
                              <div className="flex justify-between">
                                <span className="text-gray-600">Days Worked:</span>
                                <span className="text-gray-900">{daysWorked}</span>
                              </div>
                              <div className="flex justify-between pt-2 border-t border-gray-200">
                                <span className="text-gray-600">Total Paid:</span>
                                <span className="text-gray-900">₹{totalPaid.toLocaleString()}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Payouts Section */}
                <div>
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h2 className="text-xl text-gray-900 mb-1">Recent Payouts</h2>
                      <p className="text-sm text-gray-600">Individual payout records for {viewMode === 'current' ? currentMonth.monthName : 'selected period'}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-600 mb-1">Total Payout</div>
                      <div className="text-2xl text-green-600">₹{totalPayout.toLocaleString()}</div>
                    </div>
                  </div>

                  {contractPayouts.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg">
                      <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>No payouts recorded for this period</p>
                      <p className="text-sm mt-2">Add payouts to track contract employee payments</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto bg-white border border-gray-200 rounded-lg">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-200 bg-gray-50">
                            <th className="text-left py-3 px-4 text-sm text-gray-600">Employee Name</th>
                            <th className="text-left py-3 px-4 text-sm text-gray-600">Employee ID</th>
                            <th className="text-left py-3 px-4 text-sm text-gray-600">Date</th>
                            <th className="text-right py-3 px-4 text-sm text-gray-600">Amount</th>
                            <th className="text-right py-3 px-4 text-sm text-gray-600">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {contractPayouts
                            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                            .map((payout, index) => {
                              const employee = employees.find(e => e.id === payout.employeeId);
                              return (
                                <tr key={payout.id} className="border-b border-gray-100 hover:bg-gray-50">
                                  <td className="py-4 px-4">
                                    <div className="flex items-center gap-3">
                                      <div className={`w-10 h-10 rounded-full ${getAvatarColor(index)} flex items-center justify-center text-white text-sm`}>
                                        {getInitials(payout.employeeName)}
                                      </div>
                                      <div>
                                        <div className="text-gray-900">{payout.employeeName}</div>
                                        {employee?.role && (
                                          <div className="text-xs text-gray-500">{employee.role}</div>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-4 px-4">
                                    <span className="text-sm text-gray-600">{employee?.employeeId || '-'}</span>
                                  </td>
                                  <td className="py-4 px-4">
                                    <div className="flex items-center gap-2">
                                      <Calendar className="w-4 h-4 text-gray-400" />
                                      <span className="text-gray-900">
                                        {new Date(payout.date).toLocaleDateString('en-US', { 
                                          month: 'short', 
                                          day: 'numeric', 
                                          year: 'numeric' 
                                        })}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-4 px-4 text-right">
                                    <span className="text-gray-900">₹{payout.amount.toLocaleString()}</span>
                                  </td>
                                  <td className="py-4 px-4 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      <button
                                        onClick={() => {
                                          setEditingPayout(payout);
                                          setShowEditPayout(true);
                                        }}
                                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                        title="Edit payout"
                                      >
                                        <Edit2 className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() => handleDeletePayout(payout.id)}
                                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                        title="Delete payout"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* My Payouts Tab - For managers to view their own payroll */}
          {activeTab === 'my-payouts' && userEmployeeId && (() => {
            const myPayouts = filteredPayouts.filter(p => p.employeeId === userEmployeeId);
            const totalPayout = myPayouts.reduce((sum, p) => sum + p.amount, 0);

            return (
              <div className="p-6">
                <div className="mb-6">
                  <h2 className="text-xl text-gray-900 mb-1">My Payout History</h2>
                  <p className="text-sm text-gray-600">
                    View your salary and compensation records
                  </p>
                </div>

                {/* Summary Card */}
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-6 mb-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Total Received</p>
                      <p className="text-sm text-gray-500">
                        {viewMode === 'current' 
                          ? `for ${currentMonth.monthName}`
                          : `from ${customStartDate} to ${customEndDate}`
                        }
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl text-green-600">₹{totalPayout.toLocaleString()}</p>
                      <p className="text-sm text-gray-600 mt-1">{myPayouts.length} payment{myPayouts.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                </div>

                {/* Payouts Table */}
                {myPayouts.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg">
                    <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>No payouts found for the selected period</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto bg-white border border-gray-200 rounded-lg">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50">
                          <th className="text-left py-3 px-4 text-sm text-gray-600">Date</th>
                          <th className="text-left py-3 px-4 text-sm text-gray-600">Employee ID</th>
                          <th className="text-right py-3 px-4 text-sm text-gray-600">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {myPayouts
                          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                          .map((payout) => (
                            <tr key={payout.id} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="py-4 px-4">
                                <span className="text-sm text-gray-900">
                                  {new Date(payout.date).toLocaleDateString('en-IN', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric'
                                  })}
                                </span>
                              </td>
                              <td className="py-4 px-4">
                                <span className="text-sm text-gray-600">{userEmployeeId}</span>
                              </td>
                              <td className="py-4 px-4 text-right">
                                <span className="text-green-600">₹{payout.amount.toLocaleString()}</span>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Permanent Employees Tab */}
          {activeTab === 'permanent' && (() => {
            const permanentEmployees = employees.filter(e => e.type === 'fulltime');
            const permanentPayouts = filteredPayouts.filter(p => {
              const emp = employees.find(e => e.id === p.employeeId);
              return emp?.type === 'fulltime';
            });

            const totalPayout = permanentPayouts.reduce((sum, p) => sum + p.amount, 0);

            return (
              <div className="p-6">
                {/* Employees Section */}
                <div className="mb-8">
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h2 className="text-xl text-gray-900 mb-1">Permanent Employees</h2>
                      <p className="text-sm text-gray-600">Full-time employees - Monthly/periodic payouts</p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-600 mb-1">Total Employees</div>
                      <div className="text-2xl text-blue-600">{permanentEmployees.length}</div>
                    </div>
                  </div>

                  {permanentEmployees.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg">
                      <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>No permanent employees yet</p>
                      <p className="text-sm mt-2">Click "Add Employee" to get started</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto bg-white border border-gray-200 rounded-lg">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-200 bg-gray-50">
                            <th className="text-left py-3 px-4 text-sm text-gray-600">Employee Name</th>
                            <th className="text-left py-3 px-4 text-sm text-gray-600">Employee ID</th>
                            <th className="text-left py-3 px-4 text-sm text-gray-600">Role</th>
                            <th className="text-left py-3 px-4 text-sm text-gray-600">Phone</th>
                            <th className="text-left py-3 px-4 text-sm text-gray-600">Last Payout</th>
                            <th className="text-right py-3 px-4 text-sm text-gray-600">Total Paid ({viewMode === 'current' ? 'This Month' : 'Period'})</th>
                            {userRole === 'cluster_head' && (
                              <th className="text-right py-3 px-4 text-sm text-gray-600">Actions</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {permanentEmployees.map((emp, index) => {
                            const empPayouts = permanentPayouts.filter(p => p.employeeId === emp.id);
                            const totalPaid = empPayouts.reduce((sum, p) => sum + p.amount, 0);
                            const lastPayout = empPayouts.length > 0 
                              ? empPayouts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
                              : null;

                            return (
                              <tr key={emp.id} className="border-b border-gray-100 hover:bg-gray-50">
                                <td className="py-4 px-4">
                                  <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-full ${getAvatarColor(index)} flex items-center justify-center text-white text-sm`}>
                                      {getInitials(emp.name)}
                                    </div>
                                    <div className="text-gray-900">{emp.name}</div>
                                  </div>
                                </td>
                                <td className="py-4 px-4">
                                  <span className="text-sm text-gray-600">{emp.employeeId}</span>
                                </td>
                                <td className="py-4 px-4">
                                  {emp.role && (
                                    <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs">
                                      {emp.role}
                                    </span>
                                  )}
                                </td>
                                <td className="py-4 px-4">
                                  <span className="text-sm text-gray-600">{emp.phone}</span>
                                </td>
                                <td className="py-4 px-4">
                                  {lastPayout ? (
                                    <div>
                                      <div className="text-gray-900">
                                        {new Date(lastPayout.date).toLocaleDateString('en-US', { 
                                          month: 'short', 
                                          day: 'numeric', 
                                          year: 'numeric' 
                                        })}
                                      </div>
                                      <div className="text-xs text-gray-500">₹{lastPayout.amount.toLocaleString()}</div>
                                    </div>
                                  ) : (
                                    <span className="text-gray-400 text-sm">No payouts</span>
                                  )}
                                </td>
                                <td className="py-4 px-4 text-right">
                                  <span className="text-gray-900">₹{totalPaid.toLocaleString()}</span>
                                </td>
                                {userRole === 'cluster_head' && (
                                  <td className="py-4 px-4 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      <button
                                        onClick={() => {
                                          setEditingEmployee(emp);
                                          setShowEditEmployee(true);
                                        }}
                                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                        title="Edit employee"
                                      >
                                        <Edit2 className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteEmployee(emp.id)}
                                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                        title="Delete employee"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Payouts Section */}
                <div>
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h2 className="text-xl text-gray-900 mb-1">Payout History</h2>
                      <p className="text-sm text-gray-600">Salary payments for {viewMode === 'current' ? currentMonth.monthName : 'selected period'}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-600 mb-1">Total Payout</div>
                      <div className="text-2xl text-green-600">₹{totalPayout.toLocaleString()}</div>
                    </div>
                  </div>

                  {permanentPayouts.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg">
                      <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>No payouts recorded for this period</p>
                      <p className="text-sm mt-2">Add payouts to track permanent employee payments</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto bg-white border border-gray-200 rounded-lg">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-200 bg-gray-50">
                            <th className="text-left py-3 px-4 text-sm text-gray-600">Employee Name</th>
                            <th className="text-left py-3 px-4 text-sm text-gray-600">Employee ID</th>
                            <th className="text-left py-3 px-4 text-sm text-gray-600">Date</th>
                            <th className="text-right py-3 px-4 text-sm text-gray-600">Amount</th>
                            {userRole === 'cluster_head' && (
                              <th className="text-right py-3 px-4 text-sm text-gray-600">Actions</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {permanentPayouts
                            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                            .map((payout, index) => {
                              const employee = employees.find(e => e.id === payout.employeeId);
                              return (
                                <tr key={payout.id} className="border-b border-gray-100 hover:bg-gray-50">
                                  <td className="py-4 px-4">
                                    <div className="flex items-center gap-3">
                                      <div className={`w-10 h-10 rounded-full ${getAvatarColor(index)} flex items-center justify-center text-white text-sm`}>
                                        {getInitials(payout.employeeName)}
                                      </div>
                                      <div>
                                        <div className="text-gray-900">{payout.employeeName}</div>
                                        {employee?.role && (
                                          <div className="text-xs text-gray-500">{employee.role}</div>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-4 px-4">
                                    <span className="text-sm text-gray-600">{employee?.employeeId || '-'}</span>
                                  </td>
                                  <td className="py-4 px-4">
                                    <div className="flex items-center gap-2">
                                      <Calendar className="w-4 h-4 text-gray-400" />
                                      <span className="text-gray-900">
                                        {new Date(payout.date).toLocaleDateString('en-US', { 
                                          month: 'short', 
                                          day: 'numeric', 
                                          year: 'numeric' 
                                        })}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-4 px-4 text-right">
                                    <span className="text-gray-900">₹{payout.amount.toLocaleString()}</span>
                                  </td>
                                  {userRole === 'cluster_head' && (
                                    <td className="py-4 px-4 text-right">
                                      <div className="flex items-center justify-end gap-2">
                                        <button
                                          onClick={() => {
                                            setEditingPayout(payout);
                                            setShowEditPayout(true);
                                          }}
                                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                          title="Edit payout"
                                        >
                                          <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button
                                          onClick={() => handleDeletePayout(payout.id)}
                                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                          title="Delete payout"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Add Employee Modal */}
      {showAddEmployee && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl text-gray-900">Add New Employee</h2>
              <button
                onClick={() => setShowAddEmployee(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm text-gray-700 mb-2">Employee Type</label>
                <select
                  value={newEmployee.type}
                  onChange={(e) => setNewEmployee({ ...newEmployee, type: e.target.value as 'contract' | 'fulltime' })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  disabled={userRole === 'manager'}
                >
                  <option value="contract">Contract (Daily Rate)</option>
                  {userRole === 'cluster_head' && (
                    <option value="fulltime">Permanent (Full-time)</option>
                  )}
                </select>
                {userRole === 'manager' && (
                  <p className="text-xs text-gray-500 mt-1">Managers can only add contract employees</p>
                )}
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-2">Name *</label>
                <input
                  type="text"
                  value={newEmployee.name}
                  onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="Enter employee name"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-2">Phone *</label>
                <input
                  type="tel"
                  value={newEmployee.phone}
                  onChange={(e) => setNewEmployee({ ...newEmployee, phone: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="Enter phone number"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-2">Role (Optional)</label>
                <input
                  type="text"
                  value={newEmployee.role}
                  onChange={(e) => setNewEmployee({ ...newEmployee, role: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="e.g., Chef, Delivery Boy"
                />
              </div>
              {newEmployee.type === 'contract' && (
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Daily Rate (Optional)</label>
                  <input
                    type="number"
                    value={newEmployee.dailyRate}
                    onChange={(e) => setNewEmployee({ ...newEmployee, dailyRate: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    placeholder="Enter daily rate"
                  />
                </div>
              )}
            </div>
            <div className="p-6 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => setShowAddEmployee(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddEmployee}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Add Employee
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Employee Modal */}
      {showEditEmployee && editingEmployee && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl text-gray-900">Edit Employee</h2>
              <button
                onClick={() => setShowEditEmployee(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm text-gray-700 mb-2">Employee ID</label>
                <input
                  type="text"
                  value={editingEmployee.employeeId}
                  disabled
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-2">Name *</label>
                <input
                  type="text"
                  value={editingEmployee.name}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-2">Phone *</label>
                <input
                  type="tel"
                  value={editingEmployee.phone}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, phone: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-2">Role (Optional)</label>
                <input
                  type="text"
                  value={editingEmployee.role || ''}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, role: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              {editingEmployee.type === 'contract' && (
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Daily Rate (Optional)</label>
                  <input
                    type="number"
                    value={editingEmployee.dailyRate || ''}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, dailyRate: parseFloat(e.target.value) || undefined })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              )}
            </div>
            <div className="p-6 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => setShowEditEmployee(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEditEmployee}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Update Employee
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Payout Modal */}
      {showPayoutModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl text-gray-900">Add Payout</h2>
              <button
                onClick={() => setShowPayoutModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm text-gray-700 mb-2">Select Employees *</label>
                <div className="border border-gray-300 rounded-lg p-3 max-h-40 overflow-y-auto space-y-2">
                  {filteredEmployees.map(emp => (
                    <label key={emp.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
                      <input
                        type="checkbox"
                        checked={payoutData.employeeIds.includes(emp.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setPayoutData({ ...payoutData, employeeIds: [...payoutData.employeeIds, emp.id] });
                          } else {
                            setPayoutData({ ...payoutData, employeeIds: payoutData.employeeIds.filter(id => id !== emp.id) });
                          }
                        }}
                        className="w-4 h-4"
                      />
                      <span className="text-sm text-gray-900">{emp.name} ({emp.employeeId})</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">{payoutData.employeeIds.length} employee(s) selected</p>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-2">Amount (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={payoutData.amount}
                  onChange={(e) => setPayoutData({ ...payoutData, amount: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="Enter amount"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-2">Date *</label>
                <input
                  type="date"
                  value={payoutData.date}
                  onChange={(e) => setPayoutData({ ...payoutData, date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => setShowPayoutModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddPayout}
                disabled={submitting}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Adding...' : 'Add Payout'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Payout Modal */}
      {showEditPayout && editingPayout && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl text-gray-900">Edit Payout</h2>
              <button
                onClick={() => setShowEditPayout(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm text-gray-700 mb-2">Employee</label>
                <input
                  type="text"
                  value={editingPayout.employeeName}
                  disabled
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-2">Amount (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={editingPayout.amount}
                  onChange={(e) => setEditingPayout({ ...editingPayout, amount: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-2">Date *</label>
                <input
                  type="date"
                  value={editingPayout.date}
                  onChange={(e) => setEditingPayout({ ...editingPayout, date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => setShowEditPayout(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEditPayout}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Update Payout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Employee Account Setup Modal */}
      {showAccountSetup && (
        <EmployeeAccountSetup
          onClose={() => setShowAccountSetup(false)}
          employees={employees}
        />
      )}
    </div>
  );
}
