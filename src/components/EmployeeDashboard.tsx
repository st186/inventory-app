import { useState, useEffect } from 'react';
import { Wallet, Calendar, TrendingUp, DollarSign, FileText, Download, User, Phone, Mail, Briefcase, MapPin } from 'lucide-react';
import * as api from '../utils/api';

interface EmployeeDashboardProps {
  employeeId: string;
}

// Payslip generation function
const generatePayslip = (
  employeeName: string,
  employeeId: string,
  month: string,
  year: string,
  payouts: any[],
  employeeType: string
) => {
  const totalAmount = payouts.reduce((sum, p) => sum + p.amount, 0);
  
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
                <td>${employeeType === 'fulltime' ? 'Salary Payment' : 'Daily Wage Payment'}</td>
                <td style="text-align: right;">₹${payout.amount.toLocaleString('en-IN')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="total-section">
          <div class="total-label">Net ${employeeType === 'fulltime' ? 'Salary' : 'Payment'} for ${month} ${year}</div>
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

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(payslipContent);
    printWindow.document.close();
    
    printWindow.onload = () => {
      printWindow.print();
    };
  }
};

export function EmployeeDashboard({ employeeId }: EmployeeDashboardProps) {
  const [employee, setEmployee] = useState<any>(null);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'payouts' | 'manager'>('payouts');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [managerDetails, setManagerDetails] = useState<any>(null);
  const [seniorManagerDetails, setSeniorManagerDetails] = useState<any>(null);

  useEffect(() => {
    loadEmployeeData();
  }, [employeeId]);

  const loadEmployeeData = async () => {
    try {
      setLoading(true);
      const employees = await api.getEmployees();
      const currentEmployee = employees.find((emp: any) => emp.employeeId === employeeId);
      
      if (currentEmployee) {
        setEmployee(currentEmployee);
        
        // Load payouts for this employee
        const allPayouts = await api.getPayouts();
        const employeePayouts = allPayouts.filter(
          (payout: any) => payout.employeeId === currentEmployee.id
        );
        setPayouts(employeePayouts);

        // Load manager details if employee has an incharge
        if (currentEmployee.inchargeId) {
          const manager = employees.find((emp: any) => emp.id === currentEmployee.inchargeId);
          if (manager) {
            setManagerDetails(manager);
            
            // Load senior manager (manager's manager) if exists
            if (manager.inchargeId) {
              const seniorManager = employees.find((emp: any) => emp.id === manager.inchargeId);
              if (seniorManager) {
                setSeniorManagerDetails(seniorManager);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error loading employee data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getFilteredPayouts = () => {
    if (!selectedMonth) return payouts;
    
    const [year, month] = selectedMonth.split('-');
    return payouts.filter((payout) => {
      const payoutDate = new Date(payout.date);
      return (
        payoutDate.getFullYear() === parseInt(year) &&
        payoutDate.getMonth() + 1 === parseInt(month)
      );
    });
  };

  const filteredPayouts = getFilteredPayouts();
  const totalPayouts = filteredPayouts.reduce((sum, payout) => sum + payout.amount, 0);

  // Add this helper function after the state declarations
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

  const getMonthName = (monthNumber: number) => {
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    return monthNames[monthNumber];
  };

  // Generate monthly payslips data (last 12 months)
  const getMonthlyPayslips = () => {
    const now = new Date();
    const slips = [];
    
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const month = getMonthName(date.getMonth());
      const year = date.getFullYear().toString();
      
      // Get payouts for this month
      const monthPayouts = payouts.filter(payout => {
        const payoutDate = new Date(payout.date);
        return payoutDate.getMonth() === date.getMonth() && 
               payoutDate.getFullYear() === date.getFullYear();
      });
      
      const total = monthPayouts.reduce((sum, p) => sum + p.amount, 0);
      
      // Payslips are available after the 4th of the following month
      const nextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 5);
      const isAvailable = now >= nextMonth;
      
      slips.push({
        month,
        year,
        payouts: monthPayouts,
        total,
        isAvailable
      });
    }
    
    return slips;
  };

  const monthlyPayslips = getMonthlyPayslips();

  // Generate available months
  const getAvailableMonths = () => {
    const months = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      months.push({
        value: monthStr,
        label: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      });
    }
    return months;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your data...</p>
        </div>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-sm p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">⚠️</span>
          </div>
          <h2 className="text-xl text-gray-900 mb-2">Employee Not Found</h2>
          <p className="text-gray-600">
            Your employee profile hasn't been set up yet. Please contact your manager or cluster head.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl text-gray-900 mb-2">Welcome, {employee.name}!</h1>
          <p className="text-gray-600">View your payout history and employee details</p>
        </div>

        {/* Employee Info Card */}
        <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-lg text-gray-900 mb-4">Employee Information</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-gray-600">Employee ID</div>
              <div className="font-medium text-gray-900">{employee.employeeId}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Name</div>
              <div className="font-medium text-gray-900">{employee.name}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Type</div>
              <div className="font-medium text-gray-900">
                {employee.type === 'fulltime' ? '👔 Permanent' : '📝 Contract'}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Role</div>
              <div className="font-medium text-gray-900">{employee.role || 'N/A'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Phone</div>
              <div className="font-medium text-gray-900">{employee.phone}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Email</div>
              <div className="font-medium text-gray-900">{employee.email || 'N/A'}</div>
            </div>
            {employee.dailyRate && (
              <div>
                <div className="text-sm text-gray-600">Daily Rate</div>
                <div className="font-medium text-gray-900">₹{employee.dailyRate}</div>
              </div>
            )}
          </div>
        </div>

        {/* My Details Section with Tabs */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-6">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl text-gray-900 mb-4">My Details</h2>
            
            {/* Tab Navigation */}
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('payouts')}
                className={`px-6 py-2 rounded-lg transition-colors ${
                  activeTab === 'payouts'
                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4" />
                  <span>My Payouts</span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab('manager')}
                className={`px-6 py-2 rounded-lg transition-colors ${
                  activeTab === 'manager'
                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  <span>My Manager</span>
                </div>
              </button>
            </div>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {/* My Payouts Tab */}
            {activeTab === 'payouts' && (
              <div>
                {/* Month Selector */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg text-gray-900 flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-blue-600" />
                      Select Month
                    </h3>
                  </div>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="w-full md:w-auto px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    {getAvailableMonths().map((month) => (
                      <option key={month.value} value={month.value}>
                        {month.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Statistics */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-6 border border-green-200">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm text-gray-600">Total Payouts</div>
                      <DollarSign className="w-5 h-5 text-green-600" />
                    </div>
                    <div className="text-2xl text-gray-900">₹{totalPayouts.toLocaleString()}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {filteredPayouts.length} payment{filteredPayouts.length !== 1 ? 's' : ''}
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg p-6 border border-blue-200">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm text-gray-600">Average Payout</div>
                      <TrendingUp className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="text-2xl text-gray-900">
                      ₹{filteredPayouts.length > 0 ? Math.round(totalPayouts / filteredPayouts.length).toLocaleString() : 0}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Per payment</div>
                  </div>

                  <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-6 border border-purple-200">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm text-gray-600">Payment Days</div>
                      <Wallet className="w-5 h-5 text-purple-600" />
                    </div>
                    <div className="text-2xl text-gray-900">{filteredPayouts.length}</div>
                    <div className="text-xs text-gray-500 mt-1">This month</div>
                  </div>
                </div>

                {/* Payout History Table */}
                <div className="bg-gray-50 rounded-xl overflow-hidden mb-6">
                  <div className="p-4 bg-white border-b border-gray-200">
                    <h3 className="text-lg text-gray-900">Payout History</h3>
                  </div>
                  
                  {filteredPayouts.length === 0 ? (
                    <div className="p-12 text-center bg-white">
                      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Wallet className="w-8 h-8 text-gray-400" />
                      </div>
                      <h4 className="text-lg text-gray-900 mb-2">No Payouts Yet</h4>
                      <p className="text-gray-600">No payouts recorded for the selected month.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto bg-white">
                      <table className="w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs text-gray-600">Date</th>
                            <th className="px-6 py-3 text-left text-xs text-gray-600">Amount</th>
                            <th className="px-6 py-3 text-left text-xs text-gray-600">Type</th>
                            <th className="px-6 py-3 text-left text-xs text-gray-600">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {filteredPayouts
                            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                            .map((payout) => (
                              <tr key={payout.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 text-sm text-gray-900">
                                  {new Date(payout.date).toLocaleDateString('en-IN', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric'
                                  })}
                                </td>
                                <td className="px-6 py-4 text-sm font-medium text-green-600">
                                  ₹{payout.amount.toLocaleString()}
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-600">
                                  {employee.type === 'fulltime' ? 'Salary' : 'Daily Wage'}
                                </td>
                                <td className="px-6 py-4">
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    ✓ Paid
                                  </span>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Monthly Payslips Section */}
                <div className="bg-gray-50 rounded-xl overflow-hidden">
                  <div className="p-4 bg-white border-b border-gray-200">
                    <div className="flex items-center gap-2">
                      <FileText className="w-5 h-5 text-purple-600" />
                      <h3 className="text-lg text-gray-900">Monthly Payslips</h3>
                    </div>
                    <p className="text-sm text-gray-600 mt-2">
                      Payslips are available for download after the 4th of each month
                    </p>
                  </div>
                  
                  <div className="p-6 bg-white">
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
                                  employee.name,
                                  employee.employeeId,
                                  slip.month,
                                  slip.year,
                                  slip.payouts,
                                  employee.type
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
                </div>
              </div>
            )}

            {/* My Manager Details Tab */}
            {activeTab === 'manager' && (
              <div>
                {managerDetails ? (
                  <div className="space-y-6">
                    {/* Manager Profile Card */}
                    <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 border-2 border-purple-200">
                      <div className="flex items-start gap-4">
                        <div className="w-20 h-20 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full flex items-center justify-center text-white text-2xl flex-shrink-0">
                          {managerDetails.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <h3 className="text-2xl text-gray-900 mb-1">{managerDetails.name}</h3>
                          <p className="text-sm text-purple-700 font-medium mb-3">Your Manager / Incharge</p>
                          <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                            {managerDetails.type === 'fulltime' ? 'Permanent Employee' : 'Contract Employee'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Manager Contact Details */}
                    <div className="bg-white border border-gray-200 rounded-xl p-6">
                      <h4 className="text-lg text-gray-900 mb-4 flex items-center gap-2">
                        <Phone className="w-5 h-5 text-blue-600" />
                        Contact Information
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
                          <Phone className="w-5 h-5 text-blue-600 mt-0.5" />
                          <div>
                            <div className="text-sm text-gray-600 mb-1">Phone Number</div>
                            <div className="font-medium text-gray-900">{managerDetails.phone || 'N/A'}</div>
                          </div>
                        </div>
                        <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
                          <Mail className="w-5 h-5 text-blue-600 mt-0.5" />
                          <div>
                            <div className="text-sm text-gray-600 mb-1">Email Address</div>
                            <div className="font-medium text-gray-900">{managerDetails.email || 'N/A'}</div>
                          </div>
                        </div>
                        <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
                          <Briefcase className="w-5 h-5 text-blue-600 mt-0.5" />
                          <div>
                            <div className="text-sm text-gray-600 mb-1">Role / Position</div>
                            <div className="font-medium text-gray-900">{formatDesignation(managerDetails.designation, managerDetails.role) || 'N/A'}</div>
                          </div>
                        </div>
                        <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
                          <User className="w-5 h-5 text-blue-600 mt-0.5" />
                          <div>
                            <div className="text-sm text-gray-600 mb-1">Employee ID</div>
                            <div className="font-medium text-gray-900">{managerDetails.employeeId || 'N/A'}</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Info Box */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-white text-sm">ℹ️</span>
                        </div>
                        <div>
                          <h4 className="font-medium text-blue-900 mb-1">About Your Manager</h4>
                          <ul className="text-sm text-blue-800 space-y-1">
                            <li>• Your manager is responsible for processing your payouts and leave requests</li>
                            <li>• For any work-related queries or concerns, please contact your manager</li>
                            <li>• Your manager has been assigned by the cluster head to oversee your work</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* Senior Manager Profile Card */}
                    {seniorManagerDetails && (
                      <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 border-2 border-purple-200">
                        <div className="flex items-start gap-4">
                          <div className="w-20 h-20 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full flex items-center justify-center text-white text-2xl flex-shrink-0">
                            {seniorManagerDetails.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1">
                            <h3 className="text-2xl text-gray-900 mb-1">{seniorManagerDetails.name}</h3>
                            <p className="text-sm text-purple-700 font-medium mb-3">Senior Manager / Incharge</p>
                            <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                              {seniorManagerDetails.type === 'fulltime' ? 'Permanent Employee' : 'Contract Employee'}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Senior Manager Contact Details */}
                    {seniorManagerDetails && (
                      <div className="bg-white border border-gray-200 rounded-xl p-6">
                        <h4 className="text-lg text-gray-900 mb-4 flex items-center gap-2">
                          <Phone className="w-5 h-5 text-blue-600" />
                          Contact Information
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
                            <Phone className="w-5 h-5 text-blue-600 mt-0.5" />
                            <div>
                              <div className="text-sm text-gray-600 mb-1">Phone Number</div>
                              <div className="font-medium text-gray-900">{seniorManagerDetails.phone || 'N/A'}</div>
                            </div>
                          </div>
                          <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
                            <Mail className="w-5 h-5 text-blue-600 mt-0.5" />
                            <div>
                              <div className="text-sm text-gray-600 mb-1">Email Address</div>
                              <div className="font-medium text-gray-900">{seniorManagerDetails.email || 'N/A'}</div>
                            </div>
                          </div>
                          <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
                            <Briefcase className="w-5 h-5 text-blue-600 mt-0.5" />
                            <div>
                              <div className="text-sm text-gray-600 mb-1">Role / Position</div>
                              <div className="font-medium text-gray-900">{formatDesignation(seniorManagerDetails.designation, seniorManagerDetails.role) || 'N/A'}</div>
                            </div>
                          </div>
                          <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
                            <User className="w-5 h-5 text-blue-600 mt-0.5" />
                            <div>
                              <div className="text-sm text-gray-600 mb-1">Employee ID</div>
                              <div className="font-medium text-gray-900">{seniorManagerDetails.employeeId || 'N/A'}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Info Box */}
                    {seniorManagerDetails && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-white text-sm">ℹ️</span>
                          </div>
                          <div>
                            <h4 className="font-medium text-blue-900 mb-1">About Your Senior Manager</h4>
                            <ul className="text-sm text-blue-800 space-y-1">
                              <li>• Your senior manager is responsible for processing your payouts and leave requests</li>
                              <li>• For any work-related queries or concerns, please contact your senior manager</li>
                              <li>• Your senior manager has been assigned by the cluster head to oversee your work</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <User className="w-10 h-10 text-gray-400" />
                    </div>
                    <h3 className="text-xl text-gray-900 mb-2">No Manager Assigned</h3>
                    <p className="text-gray-600 max-w-md mx-auto">
                      You don't have a manager or incharge assigned yet. Please contact your cluster head for more information.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Info Box - Only show on Payouts tab */}
        {activeTab === 'payouts' && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-white text-sm">ℹ️</span>
              </div>
              <div>
                <h4 className="font-medium text-blue-900 mb-1">About Your Payouts</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• All payouts are processed and recorded by your manager or cluster head</li>
                  <li>• This dashboard shows only your personal payout history</li>
                  <li>• For any discrepancies, please contact your manager</li>
                  <li>• Payment history is available for the last 12 months</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}