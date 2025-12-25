import { useState, useEffect } from 'react';
import { Wallet, Calendar, TrendingUp, DollarSign } from 'lucide-react';
import * as api from '../utils/api';

interface EmployeeDashboardProps {
  employeeId: string;
}

export function EmployeeDashboard({ employeeId }: EmployeeDashboardProps) {
  const [employee, setEmployee] = useState<any>(null);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

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
                {employee.type === 'permanent' ? '👔 Permanent' : '📝 Contract'}
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

        {/* Month Selector */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg text-gray-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              Select Month
            </h2>
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
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-600">Total Payouts</div>
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-2xl text-gray-900">₹{totalPayouts.toLocaleString()}</div>
            <div className="text-xs text-gray-500 mt-1">
              {filteredPayouts.length} payment{filteredPayouts.length !== 1 ? 's' : ''}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-600">Average Payout</div>
              <TrendingUp className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-2xl text-gray-900">
              ₹{filteredPayouts.length > 0 ? Math.round(totalPayouts / filteredPayouts.length).toLocaleString() : 0}
            </div>
            <div className="text-xs text-gray-500 mt-1">Per payment</div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-600">Payment Days</div>
              <Wallet className="w-5 h-5 text-purple-600" />
            </div>
            <div className="text-2xl text-gray-900">{filteredPayouts.length}</div>
            <div className="text-xs text-gray-500 mt-1">This month</div>
          </div>
        </div>

        {/* Payouts Table */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg text-gray-900">Payout History</h2>
          </div>
          
          {filteredPayouts.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Wallet className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg text-gray-900 mb-2">No Payouts Yet</h3>
              <p className="text-gray-600">No payouts recorded for the selected month.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
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
                          {employee.type === 'permanent' ? 'Salary' : 'Daily Wage'}
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

        {/* Info Box */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
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
      </div>
    </div>
  );
}