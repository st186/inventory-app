import { X, DollarSign, CreditCard, Calendar } from 'lucide-react';

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
  storeId?: string;
  createdAt: string;
}

interface OverheadItem {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  storeId?: string;
  paymentMethod?: 'cash' | 'online' | 'split';
  cashAmount?: number;
  onlineAmount?: number;
  employeeId?: string;
  employeeName?: string;
  expenseMonth?: string;
}

interface PaymentHistoryModalProps {
  employee: Employee;
  payouts: Payout[];
  personalExpenses: OverheadItem[];
  onClose: () => void;
}

export function PaymentHistoryModal({
  employee,
  payouts,
  personalExpenses,
  onClose
}: PaymentHistoryModalProps) {
  // Group payments by month (using expenseMonth for mapped expenses)
  interface MonthGroup {
    monthKey: string;
    monthLabel: string;
    payments: Array<{
      type: 'payout' | 'expense';
      data: Payout | OverheadItem;
      actualDate: string;
    }>;
  }
  
  const monthGroups: { [key: string]: MonthGroup } = {};
  
  // Add payouts to groups
  payouts.forEach(p => {
    const date = new Date(p.date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (!monthGroups[monthKey]) {
      monthGroups[monthKey] = {
        monthKey,
        monthLabel: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        payments: []
      };
    }
    
    monthGroups[monthKey].payments.push({
      type: 'payout',
      data: p,
      actualDate: p.date
    });
  });
  
  // Add expenses to groups (use expenseMonth if available)
  personalExpenses.forEach(o => {
    const monthKey = o.expenseMonth || (() => {
      const date = new Date(o.date);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    })();
    
    if (!monthGroups[monthKey]) {
      const date = new Date(monthKey + '-01');
      monthGroups[monthKey] = {
        monthKey,
        monthLabel: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        payments: []
      };
    }
    
    monthGroups[monthKey].payments.push({
      type: 'expense',
      data: o,
      actualDate: o.date
    });
  });
  
  // Sort months in descending order
  const sortedMonths = Object.values(monthGroups).sort((a, b) => 
    b.monthKey.localeCompare(a.monthKey)
  );
  
  const totalPayouts = payouts.reduce((sum, p) => sum + p.amount, 0);
  const totalExpenses = personalExpenses.reduce((sum, o) => sum + o.amount, 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" data-ai-private>
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="bg-gradient-to-r from-orange-600 via-rose-500 to-orange-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center border border-white/30 flex-shrink-0">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl text-white font-bold tracking-tight">Payment History</h2>
              <p className="text-orange-100 text-sm mt-1">
                {employee.name} ({employee.employeeId})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 shadow-lg shadow-blue-500/20 text-white">
              <p className="text-xs uppercase tracking-wide text-blue-100 mb-1">Total Payouts</p>
              <p className="text-2xl font-semibold">
                {payouts.length}
              </p>
              <p className="text-xs text-blue-100 mt-1">
                ₹{totalPayouts.toLocaleString('en-IN')}
              </p>
            </div>
            <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl p-4 shadow-lg shadow-orange-500/20 text-white">
              <p className="text-xs uppercase tracking-wide text-orange-100 mb-1">Personal Expenses</p>
              <p className="text-2xl font-semibold">
                {personalExpenses.length}
              </p>
              <p className="text-xs text-orange-100 mt-1">
                ₹{totalExpenses.toLocaleString('en-IN')}
              </p>
            </div>
            <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-4 shadow-lg shadow-emerald-500/20 text-white">
              <p className="text-xs uppercase tracking-wide text-emerald-100 mb-1">Total Paid</p>
              <p className="text-2xl font-semibold">
                ₹{(totalPayouts + totalExpenses).toLocaleString('en-IN')}
              </p>
            </div>
          </div>

          {/* Month-wise Payment History */}
          <div>
            <h3 className="text-lg font-bold text-gray-900 tracking-tight mb-3 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-orange-600" />
              Payment History (Month-wise)
            </h3>

            {payouts.length === 0 && personalExpenses.length === 0 ? (
              <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-xl">
                <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No payment history found</p>
              </div>
            ) : (
              <div className="space-y-6">
                {sortedMonths.map((monthGroup) => {
                  const monthTotal = monthGroup.payments.reduce((sum, p) => {
                    if (p.type === 'payout') {
                      return sum + (p.data as Payout).amount;
                    } else {
                      return sum + (p.data as OverheadItem).amount;
                    }
                  }, 0);
                  
                  return (
                    <div key={monthGroup.monthKey} className="border-2 border-orange-200 rounded-xl overflow-hidden">
                      {/* Month Header */}
                      <div className="bg-gradient-to-r from-orange-100 to-amber-100 px-4 py-3 border-b border-orange-200">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-orange-600" />
                            <h4 className="text-lg font-semibold text-gray-900">{monthGroup.monthLabel}</h4>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-gray-600">{monthGroup.payments.length} payment{monthGroup.payments.length !== 1 ? 's' : ''}</p>
                            <p className="text-lg font-semibold text-orange-900">₹{monthTotal.toLocaleString('en-IN')}</p>
                          </div>
                        </div>
                      </div>
                      
                      {/* Payments List */}
                      <div className="p-3 space-y-2 bg-white">
                        {monthGroup.payments
                          .sort((a, b) => new Date(b.actualDate).getTime() - new Date(a.actualDate).getTime())
                          .map((payment) => {
                            if (payment.type === 'payout') {
                              const payout = payment.data as Payout;
                              return (
                                <div key={`payout-${payout.id}`} className="border border-blue-200 rounded-lg p-3 bg-blue-50">
                                  <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2">
                                        <DollarSign className="w-4 h-4 text-blue-600" />
                                        <span className="text-sm font-medium text-blue-900">Regular Payout</span>
                                      </div>
                                      <p className="text-sm text-gray-600 mt-1">
                                        {new Date(payout.date).toLocaleDateString('en-US', { 
                                          weekday: 'short', 
                                          month: 'short', 
                                          day: 'numeric', 
                                          year: 'numeric' 
                                        })}
                                      </p>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-lg font-semibold text-blue-900">₹{payout.amount.toLocaleString('en-IN')}</p>
                                    </div>
                                  </div>
                                </div>
                              );
                            } else {
                              const expense = payment.data as OverheadItem;
                              const isPaid = new Date(expense.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                              const isMapped = expense.expenseMonth && expense.expenseMonth !== `${new Date(expense.date).getFullYear()}-${String(new Date(expense.date).getMonth() + 1).padStart(2, '0')}`;
                              
                              return (
                                <div key={`expense-${expense.id}`} className="border border-orange-200 rounded-lg p-3 bg-orange-50">
                                  <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2">
                                        <CreditCard className="w-4 h-4 text-orange-600" />
                                        <span className="text-sm font-medium text-orange-900">Salary (Personal Expense)</span>
                                      </div>
                                      {isMapped ? (
                                        <p className="text-xs text-orange-600 mt-1 font-medium flex items-center gap-1">
                                          📅 Mapped to this month • Paid on: {isPaid}
                                        </p>
                                      ) : (
                                        <p className="text-sm text-gray-600 mt-1">
                                          {isPaid}
                                        </p>
                                      )}
                                      <p className="text-sm text-gray-500 mt-1">{expense.description}</p>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-lg font-semibold text-orange-900">₹{expense.amount.toLocaleString('en-IN')}</p>
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                          })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
