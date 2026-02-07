import { useState, useEffect } from 'react';
import { TrendingUp, UserPlus, User, Phone, Mail, Building, Edit, Trash2, DollarSign, Calendar, AlertCircle, CheckCircle, XCircle, ArrowRight } from 'lucide-react';
import { InventoryContextType } from '../App';
import * as api from '../utils/api';
import { toast } from 'sonner@2.0.3';

type Props = {
  context: InventoryContextType;
};

type Investor = {
  id: string;
  name: string;
  contactNumber?: string;
  email?: string;
  address?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
};

export function InvestmentsManagement({ context }: Props) {
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingInvestor, setEditingInvestor] = useState<Investor | null>(null);
  const [loans, setLoans] = useState<api.OnlineLoan[]>([]);
  const [repayments, setRepayments] = useState<any[]>([]);

  // Form state
  const [name, setName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadInvestors();
    loadLoans();
    loadRepayments();
  }, [context.user]);

  const loadInvestors = async () => {
    if (!context.user?.accessToken) return;
    try {
      setLoading(true);
      const data = await api.getInvestors(context.user.accessToken);
      setInvestors(data);
    } catch (error) {
      console.error('Error loading investors:', error);
      toast.error('Failed to load investors');
    } finally {
      setLoading(false);
    }
  };

  const loadLoans = async () => {
    if (!context.user?.accessToken) return;
    try {
      const data = await api.getAllOnlineLoans(context.user.accessToken);
      setLoans(data);
    } catch (error) {
      console.error('Error loading loans:', error);
    }
  };

  const loadRepayments = async () => {
    if (!context.user?.accessToken) return;
    try {
      const data = await api.getAllLoanRepayments(context.user.accessToken);
      setRepayments(data);
    } catch (error) {
      console.error('Error loading repayments:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!context.user?.accessToken) return;

    try {
      setSaving(true);
      const investorData = {
        name,
        contactNumber,
        email,
        address,
        notes,
        createdBy: context.user.email,
      };

      if (editingInvestor) {
        await api.updateInvestor(context.user.accessToken, editingInvestor.id, investorData);
        toast.success('Investor updated successfully');
      } else {
        await api.createInvestor(context.user.accessToken, investorData);
        toast.success('Investor added successfully');
      }

      resetForm();
      setShowAddModal(false);
      loadInvestors();
    } catch (error) {
      console.error('Error saving investor:', error);
      toast.error('Failed to save investor');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (investor: Investor) => {
    setEditingInvestor(investor);
    setName(investor.name);
    setContactNumber(investor.contactNumber || '');
    setEmail(investor.email || '');
    setAddress(investor.address || '');
    setNotes(investor.notes || '');
    setShowAddModal(true);
  };

  const handleDelete = async (investorId: string) => {
    if (!context.user?.accessToken) return;
    if (!confirm('Are you sure you want to delete this investor?')) return;

    try {
      await api.deleteInvestor(context.user.accessToken, investorId);
      toast.success('Investor deleted successfully');
      loadInvestors();
    } catch (error) {
      console.error('Error deleting investor:', error);
      toast.error('Failed to delete investor');
    }
  };

  const resetForm = () => {
    setName('');
    setContactNumber('');
    setEmail('');
    setAddress('');
    setNotes('');
    setEditingInvestor(null);
  };

  // Calculate investment analytics for each investor
  const getInvestorAnalytics = (investorId: string) => {
    const investorLoans = loans.filter(loan => loan.investorId === investorId);
    const totalLent = investorLoans.reduce((sum, loan) => sum + loan.loanAmount, 0);
    const totalRepaid = investorLoans.reduce((sum, loan) => sum + loan.repaidAmount, 0);
    const totalInterest = investorLoans.reduce((sum, loan) => {
      const interest = (loan.interestRate || 0) / 100 * loan.loanAmount;
      return sum + interest;
    }, 0);
    const activeLoans = investorLoans.filter(loan => loan.status === 'active').length;
    const outstanding = totalLent + totalInterest - totalRepaid;

    return {
      totalLent,
      totalRepaid,
      totalInterest,
      activeLoans,
      outstanding,
      investorLoans
    };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Investors & Investment Analytics</h2>
          <p className="text-gray-600 mt-1">Manage investors and track loan repayments</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowAddModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-500 text-white rounded-lg hover:from-purple-700 hover:to-pink-600 transition-all shadow-lg"
        >
          <UserPlus className="w-5 h-5" />
          Add Investor
        </button>
      </div>

      {/* Investors List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
        </div>
      ) : investors.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-12 text-center border-2 border-dashed border-gray-300">
          <User className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Investors Yet</h3>
          <p className="text-gray-600 mb-6">Add your first investor to start tracking investments and loans</p>
          <button
            onClick={() => {
              resetForm();
              setShowAddModal(true);
            }}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-500 text-white rounded-lg hover:from-purple-700 hover:to-pink-600 transition-all shadow-lg"
          >
            <UserPlus className="w-5 h-5" />
            Add First Investor
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {investors.map((investor) => {
            const analytics = getInvestorAnalytics(investor.id);
            return (
              <div key={investor.id} className="bg-white rounded-xl shadow-lg border-2 border-purple-100 overflow-hidden">
                {/* Investor Header */}
                <div className="bg-gradient-to-r from-purple-600 to-pink-500 p-6 text-white">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
                          <User className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold">{investor.name}</h3>
                          {investor.contactNumber && (
                            <div className="flex items-center gap-2 text-purple-100 text-sm mt-1">
                              <Phone className="w-3 h-3" />
                              {investor.contactNumber}
                            </div>
                          )}
                        </div>
                      </div>
                      {investor.email && (
                        <div className="flex items-center gap-2 text-purple-100 text-sm">
                          <Mail className="w-3 h-3" />
                          {investor.email}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(investor)}
                        className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(investor.id)}
                        className="p-2 bg-white/20 hover:bg-red-500 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Investment Analytics */}
                <div className="p-6">
                  <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-purple-600" />
                    Investment Summary
                  </h4>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-blue-50 rounded-lg p-3">
                      <p className="text-xs text-gray-600 mb-1">Total Lent</p>
                      <p className="text-xl font-bold text-blue-600">₹{analytics.totalLent.toLocaleString()}</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3">
                      <p className="text-xs text-gray-600 mb-1">Total Repaid</p>
                      <p className="text-xl font-bold text-green-600">₹{analytics.totalRepaid.toLocaleString()}</p>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-3">
                      <p className="text-xs text-gray-600 mb-1">Interest Accrued</p>
                      <p className="text-xl font-bold text-amber-600">₹{analytics.totalInterest.toFixed(2)}</p>
                    </div>
                    <div className="bg-red-50 rounded-lg p-3">
                      <p className="text-xs text-gray-600 mb-1">Outstanding</p>
                      <p className="text-xl font-bold text-red-600">₹{analytics.outstanding.toFixed(2)}</p>
                    </div>
                  </div>

                  {/* Active Loans */}
                  {analytics.activeLoans > 0 && (
                    <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-3">
                      <p className="text-sm font-semibold text-purple-900">
                        {analytics.activeLoans} Active Loan{analytics.activeLoans !== 1 ? 's' : ''}
                      </p>
                    </div>
                  )}

                  {/* Recent Loans */}
                  {analytics.investorLoans.length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <h5 className="text-sm font-semibold text-gray-700 mb-2">Recent Loans</h5>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {analytics.investorLoans.slice(0, 5).map(loan => (
                          <div key={loan.id} className="flex items-center justify-between text-sm p-2 bg-gray-50 rounded">
                            <div>
                              <p className="font-medium text-gray-900">₹{loan.loanAmount.toLocaleString()}</p>
                              <p className="text-xs text-gray-600">{loan.loanDate} • {loan.interestRate || 0}% interest</p>
                            </div>
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${
                              loan.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                            }`}>
                              {loan.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {investor.notes && (
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-xs text-gray-600 mb-1">Notes</p>
                      <p className="text-sm text-gray-800">{investor.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Investor Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={() => {
            setShowAddModal(false);
            resetForm();
          }}
        >
          <div
            className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-500 to-pink-500 p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold flex items-center gap-2">
                    <UserPlus className="w-6 h-6" />
                    {editingInvestor ? 'Edit Investor' : 'Add New Investor'}
                  </h2>
                  <p className="text-purple-100 mt-1">Enter investor details</p>
                </div>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Investor Name *
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    placeholder="Enter investor name"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Contact Number
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
                  <input
                    type="tel"
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    placeholder="Enter contact number"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    placeholder="Enter email address"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Address
                </label>
                <div className="relative">
                  <Building className="absolute left-3 top-3 text-gray-500 w-5 h-5" />
                  <textarea
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    rows={2}
                    className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    placeholder="Enter address"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  placeholder="Additional notes about this investor"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                  className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !name}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-5 h-5" />
                      {editingInvestor ? 'Update Investor' : 'Add Investor'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
