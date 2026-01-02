import { useState, useEffect, useMemo } from 'react';
import { Plus, Users, DollarSign, Calendar, X, Edit2, Trash2, Download, FileText } from 'lucide-react';
import * as api from '../utils/api';
import { EmployeeAccountSetup } from './EmployeeAccountSetup';
import { DatePicker } from './DatePicker';

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
  selectedStoreId?: string | null;
  isIncharge?: boolean;
  inchargeDesignation?: 'store_incharge' | 'production_incharge' | null;
}

// Helper function to generate payslip PDF
const generatePayslip = (
  employeeName: string,
  employeeId: string,
  month: string,
  year: string,
  payouts: Payout[],
  employeeType: string
) => {
  const totalAmount = payouts.reduce((sum, p) => sum + p.amount, 0);
  const grossSalary = totalAmount;
  
  // Create a simple HTML content for the payslip
  const payslipContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Payslip - ${month} ${year}</title>
      <style>
        body {
          font-family: 'Arial', sans-serif;
          margin: 0;
          padding: 20px;
          color: #333;
        }
        .payslip-container {
          max-width: 800px;
          margin: 0 auto;
          border: 2px solid #9333ea;
          padding: 30px;
          background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%);
        }
        .header {
          text-align: center;
          border-bottom: 3px solid #9333ea;
          padding-bottom: 20px;
          margin-bottom: 30px;
        }
        .company-name {
          font-size: 32px;
          font-weight: bold;
          color: #9333ea;
          margin-bottom: 5px;
        }
        .company-tagline {
          font-size: 14px;
          color: #666;
          font-style: italic;
        }
        .payslip-title {
          font-size: 24px;
          color: #9333ea;
          margin: 20px 0 10px 0;
          font-weight: bold;
        }
        .payslip-period {
          font-size: 16px;
          color: #666;
          margin-bottom: 20px;
        }
        .info-section {
          display: table;
          width: 100%;
          margin-bottom: 30px;
        }
        .info-row {
          display: table-row;
        }
        .info-label {
          display: table-cell;
          padding: 10px 0;
          font-weight: bold;
          color: #9333ea;
          width: 40%;
        }
        .info-value {
          display: table-cell;
          padding: 10px 0;
          color: #333;
        }
        .payment-table {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
          background: white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .payment-table th {
          background: linear-gradient(135deg, #9333ea 0%, #c084fc 100%);
          color: white;
          padding: 12px;
          text-align: left;
          font-weight: bold;
        }
        .payment-table td {
          padding: 12px;
          border-bottom: 1px solid #e5e7eb;
        }
        .payment-table tr:last-child td {
          border-bottom: none;
        }
        .payment-table tr:nth-child(even) {
          background: #faf5ff;
        }
        .total-section {
          background: linear-gradient(135deg, #9333ea 0%, #c084fc 100%);
          color: white;
          padding: 20px;
          margin-top: 30px;
          border-radius: 8px;
          text-align: center;
        }
        .total-label {
          font-size: 18px;
          margin-bottom: 10px;
        }
        .total-amount {
          font-size: 36px;
          font-weight: bold;
        }
        .footer {
          margin-top: 40px;
          padding-top: 20px;
          border-top: 2px solid #9333ea;
          text-align: center;
          font-size: 12px;
          color: #666;
        }
        .signature-section {
          margin-top: 60px;
          display: flex;
          justify-content: space-between;
        }
        .signature-box {
          text-align: center;
          width: 45%;
        }
        .signature-line {
          border-top: 2px solid #9333ea;
          margin-top: 50px;
          padding-top: 10px;
          font-weight: bold;
          color: #9333ea;
        }
        @media print {
          body {
            padding: 0;
          }
          .payslip-container {
            border: none;
            box-shadow: none;
          }
        }
      </style>
    </head>
    <body>
      <div class="payslip-container">
        <div class="header">
          <div class="company-name">BHANDAR-IMS</div>
          <div class="company-tagline">Food Business Inventory Management System</div>
          <div class="payslip-title">SALARY SLIP</div>
          <div class="payslip-period">For the Month of ${month} ${year}</div>
        </div>
        
        <div class="info-section">
          <div class="info-row">
            <div class="info-label">Employee Name:</div>
            <div class="info-value">${employeeName}</div>
          </div>
          <div class="info-row">
            <div class="info-label">Employee ID:</div>
            <div class="info-value">${employeeId}</div>
          </div>
          <div class="info-row">
            <div class="info-label">Employee Type:</div>
            <div class="info-value">${employeeType === 'fulltime' ? 'Permanent' : 'Contract'}</div>
          </div>
          <div class="info-row">
            <div class="info-label">Payment Date:</div>
            <div class="info-value">${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
          </div>
        </div>

        <table class="payment-table">
          <thead>
            <tr>
              <th>Payment Date</th>
              <th>Description</th>
              <th style="text-align: right;">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${payouts.map(payout => `
              <tr>
                <td>${new Date(payout.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                <td>Salary Payment</td>
                <td style="text-align: right;">₹${payout.amount.toLocaleString('en-IN')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="total-section">
          <div class="total-label">Net Salary for ${month} ${year}</div>
          <div class="total-amount">₹${totalAmount.toLocaleString('en-IN')}</div>
        </div>

        <div class="signature-section">
          <div class="signature-box">
            <div class="signature-line">Employee Signature</div>
          </div>
          <div class="signature-box">
            <div class="signature-line">Authorized Signatory</div>
          </div>
        </div>

        <div class="footer">
          <p>This is a computer-generated payslip and does not require a signature.</p>
          <p>© ${year} Bhandar-IMS. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  // Create a new window with the payslip content
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(payslipContent);
    printWindow.document.close();
    
    // Wait for content to load then trigger print dialog
    printWindow.onload = () => {
      printWindow.print();
    };
  }
};

export function PayrollManagement({ userRole, selectedDate, userEmployeeId, userName, selectedStoreId, isIncharge = false, inchargeDesignation = null }: PayrollManagementProps) {
  const [activeTab, setActiveTab] = useState<'contract' | 'permanent' | 'my-payouts'>('contract');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const isClusterHead = userRole === 'cluster_head';
  
  // Date range filter state
  const [viewMode, setViewMode] = useState<'current' | 'last' | 'custom'>('current');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  
  // Calculate current month start and end dates
  const getCurrentMonthDates = () => {
    // Use UTC to avoid timezone issues
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    
    // Create dates at midnight in local timezone
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    
    // Format as YYYY-MM-DD
    const startStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endDay = end.getDate();
    const endStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
    
    return {
      start: startStr,
      end: endStr,
      monthName: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    };
  };
  
  // Calculate last month start and end dates
  const getLastMonthDates = () => {
    const now = new Date();
    const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const month = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    
    // Create dates at midnight in local timezone
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    
    // Format as YYYY-MM-DD
    const startStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endDay = end.getDate();
    const endStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
    
    return {
      start: startStr,
      end: endStr,
      monthName: start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    };
  };
  
  const currentMonth = getCurrentMonthDates();
  const lastMonth = getLastMonthDates();

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

  
  // Filter employees and payouts by store and incharge permissions
  const filteredEmployees = useMemo(() => {
    let filtered = employees;
    
    // Apply store filter (include null/undefined storeIds for backward compatibility)
    if (selectedStoreId) {
      filtered = filtered.filter(emp => 
        (emp as any).storeId === selectedStoreId || 
        (emp as any).storeId === null || 
        (emp as any).storeId === undefined
      );
    }
    
    // Apply incharge permissions
    if (isIncharge && userEmployeeId) {
      filtered = filtered.filter(emp => {
        // For contract employees, incharge can see ALL contract employees
        if (emp.type === 'contract') {
          return true;
        }
        
        // For permanent employees, incharge can only see employees under them
        if (emp.type === 'fulltime') {
          return (emp as any).inchargeId === userEmployeeId;
        }
        
        return false;
      });
    }
    
    return filtered;
  }, [employees, selectedStoreId, isIncharge, userEmployeeId]);

  const filteredPayoutsByStore = useMemo(() => {
    if (!selectedStoreId) return payouts;
    const storeEmployeeIds = filteredEmployees.map(emp => emp.id);
    return payouts.filter(payout => storeEmployeeIds.includes(payout.employeeId));
  }, [payouts, filteredEmployees, selectedStoreId]);

  // Filter payouts based on selected date range (must come AFTER filteredPayoutsByStore)
  const filteredPayouts = useMemo(() => {
    let dateFiltered;
    if (viewMode === 'current') {
      // Show only current month payouts
      dateFiltered = filteredPayoutsByStore.filter(p => p.date >= currentMonth.start && p.date <= currentMonth.end);
    } else if (viewMode === 'last') {
      // Show only last month payouts
      dateFiltered = filteredPayoutsByStore.filter(p => p.date >= lastMonth.start && p.date <= lastMonth.end);
    } else {
      // Show custom date range
      if (!customStartDate || !customEndDate) return [];
      dateFiltered = filteredPayoutsByStore.filter(p => p.date >= customStartDate && p.date <= customEndDate);
    }
    return dateFiltered;
  }, [filteredPayoutsByStore, viewMode, currentMonth, lastMonth, customStartDate, customEndDate]);

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
    const contractEmployees = filteredEmployees.filter(e => e.type === 'contract');
    const contractPayouts = filteredPayouts.filter(p => {
      const emp = filteredEmployees.find(e => e.id === p.employeeId);
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
    const permanentEmployees = filteredEmployees.filter(e => e.type === 'fulltime');
    const permanentPayouts = filteredPayouts.filter(p => {
      const emp = filteredEmployees.find(e => e.id === p.employeeId);
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

  const displayEmployees = activeTab === 'contract'
    ? filteredEmployees.filter(e => e.type === 'contract')
    : filteredEmployees.filter(e => e.type === 'fulltime');

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
                    onClick={() => setViewMode('last')}
                    className={`px-4 py-2 rounded-lg transition-colors ${
                      viewMode === 'last'
                        ? 'bg-purple-600 text-white'
                        : 'bg-white text-gray-700 hover:bg-purple-50'
                    }`}
                  >
                    Last Month
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
                ) : viewMode === 'last' ? (
                  <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg">
                    <span className="text-gray-900 font-medium">{lastMonth.monthName}</span>
                  </div>
                ) : (
                  <div className="flex gap-2 items-center flex-wrap">
                    <DatePicker
                      label="From:"
                      value={customStartDate}
                      onChange={setCustomStartDate}
                    />
                    <DatePicker
                      label="To:"
                      value={customEndDate}
                      onChange={setCustomEndDate}
                    />
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
                      <p className="text-sm mt-2">Contact your cluster head to add employees</p>
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
            // Get ALL payouts for this employee (not filtered by date range)
            const allMyPayouts = payouts.filter(p => p.employeeId === userEmployeeId);
            
            // Get employee type
            const currentEmployee = employees.find(e => e.employeeId === userEmployeeId);
            const employeeType = currentEmployee?.type || 'fulltime';
            
            // Group payouts by month (last 12 months from current date)
            const now = new Date();
            const currentDay = now.getDate();
            const monthlyPayslips: Array<{
              month: string;
              year: string;
              payouts: Payout[];
              total: number;
              isAvailable: boolean;
            }> = [];
            
            for (let i = 0; i < 12; i++) {
              const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
              const monthName = date.toLocaleDateString('en-US', { month: 'long' });
              const year = date.getFullYear().toString();
              const monthNumber = date.getMonth() + 1;
              
              // Check if payslip is available (after 4th of next month)
              const nextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 5);
              const isAvailable = now >= nextMonth;
              
              // Get payouts for this month
              const monthPayouts = allMyPayouts.filter(p => {
                const payoutDate = new Date(p.date);
                return payoutDate.getMonth() + 1 === monthNumber && 
                       payoutDate.getFullYear() === date.getFullYear();
              });
              
              const total = monthPayouts.reduce((sum, p) => sum + p.amount, 0);
              
              monthlyPayslips.push({
                month: monthName,
                year,
                payouts: monthPayouts,
                total,
                isAvailable
              });
            }

            // Filtered payouts for the summary card (respects date filter)
            const myPayouts = filteredPayouts.filter(p => p.employeeId === userEmployeeId);
            const totalPayout = myPayouts.reduce((sum, p) => sum + p.amount, 0);

            return (
              <div className="p-6">
                <div className="mb-6">
                  <h2 className="text-xl text-gray-900 mb-1">My Payout History</h2>
                  <p className="text-sm text-gray-600">
                    View your salary records and download monthly payslips
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
                          : viewMode === 'last'
                          ? `for ${lastMonth.monthName}`
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

                {/* Monthly Payslips Section */}
                <div className="mb-8">
                  <div className="flex items-center gap-2 mb-4">
                    <FileText className="w-5 h-5 text-purple-600" />
                    <h3 className="text-lg text-gray-900">Monthly Payslips</h3>
                  </div>
                  <p className="text-sm text-gray-600 mb-4">
                    Payslips are available for download after the 4th of each month
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {monthlyPayslips.map((slip, index) => (
                      <div 
                        key={index}
                        className={`border-2 rounded-xl p-4 transition-all ${
                          slip.isAvailable && slip.payouts.length > 0
                            ? 'border-purple-300 bg-gradient-to-br from-purple-50 to-pink-50 hover:shadow-lg'
                            : 'border-gray-200 bg-gray-50 opacity-60'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h4 className="text-gray-900 font-semibold">{slip.month} {slip.year}</h4>
                            <p className="text-sm text-gray-600 mt-1">
                              {slip.payouts.length} payment{slip.payouts.length !== 1 ? 's' : ''}
                            </p>
                          </div>
                          {slip.isAvailable && slip.payouts.length > 0 ? (
                            <button
                              onClick={() => generatePayslip(
                                userName || 'Employee',
                                userEmployeeId,
                                slip.month,
                                slip.year,
                                slip.payouts,
                                employeeType
                              )}
                              className="flex items-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm"
                              title="Download Payslip"
                            >
                              <Download className="w-4 h-4" />
                              Download
                            </button>
                          ) : (
                            <div className="px-3 py-2 bg-gray-300 text-gray-600 rounded-lg text-sm cursor-not-allowed">
                              {slip.payouts.length === 0 ? 'No Data' : 'Not Available'}
                            </div>
                          )}
                        </div>
                        <div className="pt-3 border-t border-gray-300">
                          <p className="text-sm text-gray-600 mb-1">Total Amount</p>
                          <p className="text-xl text-gray-900 font-semibold">
                            ₹{slip.total.toLocaleString('en-IN')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Payouts Table */}
                <div className="mb-4">
                  <h3 className="text-lg text-gray-900 mb-3">Payment Details</h3>
                </div>
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
                      <p className="text-sm mt-2">Contact your cluster head to add employees</p>
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
                            <th className="text-right py-3 px-4 text-sm text-gray-600">
                              Total Paid ({viewMode === 'current' ? 'This Month' : viewMode === 'last' ? 'Last Month' : 'Period'})
                            </th>
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
                      <p className="text-sm text-gray-600">
                        Salary payments for {viewMode === 'current' ? currentMonth.monthName : viewMode === 'last' ? lastMonth.monthName : 'selected period'}
                      </p>
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
                  {displayEmployees.map(emp => (
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
              <DatePicker
                label="Date *"
                value={payoutData.date}
                onChange={(date) => setPayoutData({ ...payoutData, date })}
                className="w-full"
              />
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
              <DatePicker
                label="Date *"
                value={editingPayout.date}
                onChange={(date) => setEditingPayout({ ...editingPayout, date })}
                className="w-full"
              />
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
