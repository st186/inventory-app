import { useState, useEffect } from 'react';
import { InventoryManagement } from './components/InventoryManagement';
import { ClusterDashboard } from './components/ClusterDashboard';
import { SalesManagement } from './components/SalesManagement';
import { PayrollManagement } from './components/PayrollManagement';
import { Analytics } from './components/Analytics';
import { ExportData } from './components/ExportData';
import { EmployeeDashboard } from './components/EmployeeDashboard';
import { AuthPage } from './components/AuthPage';
import { EmployeeTimesheet } from './components/EmployeeTimesheet';
import { EmployeeLeave } from './components/EmployeeLeave';
import { CreateEmployee } from './components/CreateEmployee';
import { ApproveTimesheets } from './components/ApproveTimesheets';
import { ApproveLeaves } from './components/ApproveLeaves';
import { EmployeeHierarchy } from './components/EmployeeHierarchy';
import { AttendancePortal } from './components/AttendancePortal';
import { EmployeeManagement } from './components/EmployeeManagement';
import { SetupClusterHead } from './components/SetupClusterHead';
import { Package, BarChart3, LogOut, AlertCircle, DollarSign, Trash2, Users, TrendingUp, Download, Menu, X, Clock, Calendar, UserPlus, CheckSquare } from 'lucide-react';
import { getSupabaseClient } from './utils/supabase/client';
import { projectId, publicAnonKey } from './utils/supabase/info';
import * as api from './utils/api';

export type InventoryItem = {
  id: string;
  date: string;
  category: 'vegetables_herbs' | 'grocery_spices' | 'dairy' | 'meat' | 'packaging' | 'gas_utilities' | 'production' | 'staff_misc';
  itemName: string;
  quantity: number;
  unit: string;
  costPerUnit: number;
  totalCost: number;
};

export type OverheadItem = {
  id: string;
  date: string;
  category: 'fuel' | 'travel' | 'transportation' | 'marketing' | 'service_charge' | 'repair';
  description: string;
  amount: number;
};

export type SalesData = {
  id: string;
  date: string;
  offlineSales: number;
  paytmAmount: number;
  cashAmount: number;
  onlineSales: number;
  employeeSalary: number;
  previousCashInHand: number;
  usedOnlineMoney: number;
  actualCashInHand: number;
  cashOffset: number;
  approvalRequired: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
};

export type InventoryContextType = {
  inventory: InventoryItem[];
  overheads: OverheadItem[];
  salesData: SalesData[];
  addInventoryItem: (item: Omit<InventoryItem, 'id'>) => Promise<void>;
  addOverheadItem: (item: Omit<OverheadItem, 'id'>) => Promise<void>;
  updateInventoryItem: (id: string, item: Omit<InventoryItem, 'id'>) => Promise<void>;
  updateOverheadItem: (id: string, item: Omit<OverheadItem, 'id'>) => Promise<void>;
  deleteInventoryItem: (id: string) => Promise<void>;
  deleteOverheadItem: (id: string) => Promise<void>;
  addSalesData: (item: Omit<SalesData, 'id'>) => Promise<void>;
  updateSalesData: (id: string, item: Omit<SalesData, 'id'>) => Promise<void>;
  approveSalesData: (id: string) => Promise<void>;
  isManager: boolean;
  user: { email: string; name: string; role: string; employeeId: string | null; accessToken: string } | null;
};

export default function App() {
  // All useState hooks must be at the top, before any conditional returns
  const [activeView, setActiveView] = useState<'inventory' | 'sales' | 'payroll' | 'analytics' | 'export' | 'attendance' | 'employees'>('analytics');
  const [user, setUser] = useState<{ email: string; name: string; role: string; employeeId: string | null; accessToken: string } | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [overheads, setOverheads] = useState<OverheadItem[]>([]);
  const [salesData, setSalesData] = useState<SalesData[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Get singleton Supabase client
  const supabaseClient = getSupabaseClient();

  // Check for setup URL parameter
  const urlParams = new URLSearchParams(window.location.search);
  const isSetupMode = urlParams.get('setup') === 'cluster-head';

  // Load inventory and overhead data
  const loadData = async (accessToken: string) => {
    setIsLoadingData(true);
    setDataError(null);
    try {
      const [inventoryData, overheadsData, salesData] = await Promise.all([
        api.fetchInventory(accessToken),
        api.fetchOverheads(accessToken),
        api.fetchSalesData(accessToken)
      ]);
      setInventory(inventoryData);
      setOverheads(overheadsData);
      setSalesData(salesData);
    } catch (error) {
      console.error('Error loading data:', error);
      setDataError('Failed to load inventory data. Please refresh the page.');
    } finally {
      setIsLoadingData(false);
    }
  };

  // Check for existing session on mount using useEffect
  useEffect(() => {
    const checkSession = async () => {
      try {
        // Delete all existing cluster head accounts with email subham.tewari@bunnymomos.com
        try {
          console.log('Attempting to delete old cluster head accounts...');
          await api.deleteClusterHeadByEmail('subham.tewari@bunnymomos.com');
          console.log('Successfully deleted old cluster head account');
        } catch (error) {
          // Ignore error if account doesn't exist
          console.log('No old cluster head account to delete or deletion error:', error);
        }

        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session?.user) {
          const userData = {
            email: session.user.email || '',
            name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User',
            role: session.user.user_metadata?.role || 'manager',
            employeeId: session.user.user_metadata?.employeeId || null,
            accessToken: session.access_token
          };
          setUser(userData);
          
          // Load data for the user
          await loadData(session.access_token);
        }
      } catch (error) {
        console.log('Session check error:', error);
      } finally {
        setIsCheckingAuth(false);
      }
    };
    checkSession();
  }, []); // Empty dependency array - only run once on mount

  const handleLogin = async (email: string, password: string) => {
    setAuthError(null);
    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        setAuthError(error.message);
        return;
      }

      if (data.user && data.session) {
        const userData = {
          email: data.user.email || '',
          name: data.user.user_metadata?.name || data.user.email?.split('@')[0] || 'User',
          role: data.user.user_metadata?.role || 'manager',
          employeeId: data.user.user_metadata?.employeeId || null,
          accessToken: data.session.access_token
        };
        setUser(userData);
        
        // Load data for the user
        await loadData(data.session.access_token);
      }
    } catch (error) {
      console.log('Login error:', error);
      setAuthError('Failed to sign in. Please try again.');
    }
  };

  const handleSignup = async (email: string, password: string, name: string, role: 'manager' | 'cluster_head' | 'employee') => {
    setAuthError(null);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d/auth/signup`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
          },
          body: JSON.stringify({ email, password, name, role })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setAuthError(data.error || 'Failed to create account');
        return;
      }

      // After successful signup, sign in the user
      await handleLogin(email, password);
    } catch (error) {
      console.log('Signup error:', error);
      setAuthError('Failed to create account. Please try again.');
    }
  };

  const handleLogout = async () => {
    await supabaseClient.auth.signOut();
    setUser(null);
    setInventory([]);
    setOverheads([]);
    setSalesData([]);
    setActiveView('sales');
  };

  const addInventoryItem = async (item: Omit<InventoryItem, 'id'>) => {
    if (!user) return;
    try {
      const newItem = await api.addInventory(user.accessToken, item);
      setInventory([...inventory, newItem]);
    } catch (error) {
      console.error('Error adding inventory item:', error);
      throw error;
    }
  };

  const addOverheadItem = async (item: Omit<OverheadItem, 'id'>) => {
    if (!user) return;
    try {
      const newItem = await api.addOverhead(user.accessToken, item);
      setOverheads([...overheads, newItem]);
    } catch (error) {
      console.error('Error adding overhead item:', error);
      throw error;
    }
  };

  const deleteInventoryItem = async (id: string) => {
    if (!user) return;
    try {
      await api.deleteInventory(user.accessToken, id);
      setInventory(inventory.filter(inv => inv.id !== id));
    } catch (error) {
      console.error('Error deleting inventory item:', error);
      throw error;
    }
  };

  const deleteOverheadItem = async (id: string) => {
    if (!user) return;
    try {
      await api.deleteOverhead(user.accessToken, id);
      setOverheads(overheads.filter(ovh => ovh.id !== id));
    } catch (error) {
      console.error('Error deleting overhead item:', error);
      throw error;
    }
  };

  const updateInventoryItem = async (id: string, item: Omit<InventoryItem, 'id'>) => {
    if (!user) return;
    try {
      const updatedItem = await api.updateInventory(user.accessToken, id, item);
      setInventory(inventory.map(inv => inv.id === id ? updatedItem : inv));
    } catch (error) {
      console.error('Error updating inventory item:', error);
      throw error;
    }
  };

  const updateOverheadItem = async (id: string, item: Omit<OverheadItem, 'id'>) => {
    if (!user) return;
    try {
      const updatedItem = await api.updateOverhead(user.accessToken, id, item);
      setOverheads(overheads.map(ovh => ovh.id === id ? updatedItem : ovh));
    } catch (error) {
      console.error('Error updating overhead item:', error);
      throw error;
    }
  };

  const addSalesData = async (item: Omit<SalesData, 'id'>) => {
    if (!user) return;
    try {
      console.log('Frontend - Current user:', user);
      console.log('Frontend - User role:', user.role);
      console.log('Frontend - Access token (first 50 chars):', user.accessToken.substring(0, 50));
      const newItem = await api.addSalesData(user.accessToken, item);
      setSalesData([...salesData, newItem]);
    } catch (error) {
      console.error('Error adding sales data:', error);
      throw error;
    }
  };

  const updateSalesData = async (id: string, item: Omit<SalesData, 'id'>) => {
    if (!user) return;
    try {
      const updatedItem = await api.updateSalesData(user.accessToken, id, item);
      setSalesData(salesData.map(sd => sd.id === id ? updatedItem : sd));
    } catch (error) {
      console.error('Error updating sales data:', error);
      throw error;
    }
  };

  const approveSalesData = async (id: string) => {
    if (!user) return;
    try {
      const updatedItem = await api.approveSalesData(user.accessToken, id);
      setSalesData(salesData.map(sd => sd.id === id ? updatedItem : sd));
    } catch (error) {
      console.error('Error approving sales data:', error);
      throw error;
    }
  };

  const clearAllData = async () => {
    if (!user) return;
    if (!confirm('⚠️ WARNING: This will delete ALL inventory, overhead, and sales data. This action cannot be undone. Are you sure?')) {
      return;
    }
    try {
      await api.clearAllData(user.accessToken);
      setInventory([]);
      setOverheads([]);
      setSalesData([]);
      alert('All data has been cleared successfully.');
    } catch (error) {
      console.error('Error clearing data:', error);
      alert('Failed to clear data. Please try again.');
    }
  };

  const contextValue: InventoryContextType = {
    inventory,
    overheads,
    salesData,
    addInventoryItem,
    addOverheadItem,
    updateInventoryItem,
    updateOverheadItem,
    deleteInventoryItem,
    deleteOverheadItem,
    addSalesData,
    updateSalesData,
    approveSalesData,
    isManager: user?.role === 'manager',
    user
  };

  // Show loading state while checking auth
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Package className="w-12 h-12 text-[#B0A8D8] mx-auto mb-4 animate-pulse" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show setup page if in setup mode
  if (isSetupMode) {
    return <SetupClusterHead />;
  }

  // Show auth page if not logged in
  if (!user) {
    return (
      <AuthPage
        onLogin={handleLogin}
        onSignup={handleSignup}
        error={authError}
      />
    );
  }

  // Cluster heads should only see the dashboard
  const isClusterHead = user.role === 'cluster_head';
  const isEmployee = user.role === 'employee';

  // If employee, show only employee dashboard
  if (isEmployee) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Employee Navigation */}
        <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div>
                <h1 className="text-lg sm:text-xl text-gray-900">Employee Portal</h1>
                <p className="text-xs sm:text-sm text-gray-500">
                  {user.name}
                </p>
              </div>
              
              {/* Mobile Menu Button */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="lg:hidden flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
              
              {/* Desktop Menu */}
              <div className="hidden lg:flex gap-2">
                <button
                  onClick={() => setActiveView('analytics')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                    activeView === 'analytics'
                      ? 'bg-[#D4A5FF] text-gray-800 border-2 border-[#C7A7FF]'
                      : 'bg-gray-50 text-gray-700 hover:bg-[#F5F0FF] border-2 border-transparent'
                  }`}
                >
                  <TrendingUp className="w-4 h-4" />
                  <span>Analytics</span>
                </button>
                <button
                  onClick={() => setActiveView('payroll')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                    activeView === 'payroll'
                      ? 'bg-[#B0E0E6] text-gray-800 border-2 border-[#AEC6CF]'
                      : 'bg-gray-50 text-gray-700 hover:bg-[#F0F8FF] border-2 border-transparent'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>My Payouts</span>
                </button>
                <button
                  onClick={() => setActiveView('attendance')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                    activeView === 'attendance'
                      ? 'bg-[#FFDAB9] text-gray-800 border-2 border-[#FFB347]'
                      : 'bg-gray-50 text-gray-700 hover:bg-[#FFF5EE] border-2 border-transparent'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  <span>Attendance</span>
                </button>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Logout</span>
                </button>
              </div>
            </div>
            
            {/* Mobile Menu */}
            {isMobileMenuOpen && (
              <div className="lg:hidden border-t border-gray-200 py-4 space-y-2">
                <button
                  onClick={() => {
                    setActiveView('analytics');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    activeView === 'analytics'
                      ? 'bg-[#D4A5FF] text-gray-800'
                      : 'bg-gray-50 text-gray-700 hover:bg-[#F5F0FF]'
                  }`}
                >
                  <TrendingUp className="w-5 h-5" />
                  <span>Analytics</span>
                </button>
                <button
                  onClick={() => {
                    setActiveView('payroll');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    activeView === 'payroll'
                      ? 'bg-[#B0E0E6] text-gray-800'
                      : 'bg-gray-50 text-gray-700 hover:bg-[#F0F8FF]'
                  }`}
                >
                  <Users className="w-5 h-5" />
                  <span>My Payouts</span>
                </button>
                <button
                  onClick={() => {
                    setActiveView('attendance');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    activeView === 'attendance'
                      ? 'bg-[#FFDAB9] text-gray-800'
                      : 'bg-gray-50 text-gray-700 hover:bg-[#FFF5EE]'
                  }`}
                >
                  <Clock className="w-5 h-5" />
                  <span>Attendance</span>
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <LogOut className="w-5 h-5" />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        </nav>

        {/* Employee Main Content */}
        <main className="pb-6">
          {activeView === 'analytics' ? (
            <Analytics context={contextValue} />
          ) : activeView === 'payroll' ? (
            <EmployeeDashboard employeeId={user.employeeId || ''} />
          ) : activeView === 'attendance' ? (
            <AttendancePortal user={{
              employeeId: user.employeeId,
              name: user.name,
              email: user.email,
              role: user.role
            }} />
          ) : (
            <EmployeeDashboard employeeId={user.employeeId || ''} />
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div>
              <h1 className="text-lg sm:text-xl text-gray-900">Bhandar-IMS</h1>
              <p className="text-xs sm:text-sm text-gray-500">
                {user.name} ({user.role === 'manager' ? 'Manager' : 'Cluster Head'})
              </p>
            </div>
            
            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            
            {/* Desktop Menu */}
            <div className="hidden lg:flex gap-2 flex-wrap">
              {isClusterHead ? (
                <>
                  <button
                    onClick={() => setActiveView('analytics')}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                      activeView === 'analytics'
                        ? 'bg-[#D4A5FF] text-gray-800 border-2 border-[#C7A7FF]'
                        : 'bg-gray-50 text-gray-700 hover:bg-[#F5F0FF] border-2 border-transparent'
                    }`}
                  >
                    <TrendingUp className="w-4 h-4" />
                    <span className="hidden xl:inline">Analytics</span>
                  </button>
                  <button
                    onClick={() => setActiveView('sales')}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                      activeView === 'sales'
                        ? 'bg-[#FFD4E5] text-gray-800 border-2 border-[#FFC0D9]'
                        : 'bg-gray-50 text-gray-700 hover:bg-[#FFF5F8] border-2 border-transparent'
                    }`}
                  >
                    <DollarSign className="w-4 h-4" />
                    <span className="hidden xl:inline">Sales</span>
                  </button>
                  <button
                    onClick={() => setActiveView('payroll')}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                      activeView === 'payroll'
                        ? 'bg-[#B0E0E6] text-gray-800 border-2 border-[#AEC6CF]'
                        : 'bg-gray-50 text-gray-700 hover:bg-[#F0F8FF] border-2 border-transparent'
                    }`}
                  >
                    <Users className="w-4 h-4" />
                    <span className="hidden xl:inline">Payroll</span>
                  </button>
                  <button
                    onClick={() => setActiveView('export')}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                      activeView === 'export'
                        ? 'bg-[#FFE5B4] text-gray-800 border-2 border-[#FFD700]'
                        : 'bg-gray-50 text-gray-700 hover:bg-[#FFF8DC] border-2 border-transparent'
                    }`}
                  >
                    <Download className="w-4 h-4" />
                    <span className="hidden xl:inline">Export</span>
                  </button>
                  <button
                    onClick={() => setActiveView('attendance')}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                      activeView === 'attendance'
                        ? 'bg-[#FFDAB9] text-gray-800 border-2 border-[#FFB347]'
                        : 'bg-gray-50 text-gray-700 hover:bg-[#FFF5EE] border-2 border-transparent'
                    }`}
                  >
                    <Clock className="w-4 h-4" />
                    <span className="hidden xl:inline">Attendance</span>
                  </button>
                  <button
                    onClick={() => setActiveView('employees')}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                      activeView === 'employees'
                        ? 'bg-[#E6E6FA] text-gray-800 border-2 border-[#D8BFD8]'
                        : 'bg-gray-50 text-gray-700 hover:bg-[#F8F8FF] border-2 border-transparent'
                    }`}
                  >
                    <UserPlus className="w-4 h-4" />
                    <span className="hidden xl:inline">Employees</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setActiveView('analytics')}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                      activeView === 'analytics'
                        ? 'bg-[#D4A5FF] text-gray-800 border-2 border-[#C7A7FF]'
                        : 'bg-gray-50 text-gray-700 hover:bg-[#F5F0FF] border-2 border-transparent'
                    }`}
                  >
                    <TrendingUp className="w-4 h-4" />
                    <span className="hidden xl:inline">Analytics</span>
                  </button>
                  <button
                    onClick={() => setActiveView('sales')}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                      activeView === 'sales'
                        ? 'bg-[#FFD4E5] text-gray-800 border-2 border-[#FFC0D9]'
                        : 'bg-gray-50 text-gray-700 hover:bg-[#FFF5F8] border-2 border-transparent'
                    }`}
                  >
                    <DollarSign className="w-4 h-4" />
                    <span className="hidden xl:inline">Sales</span>
                  </button>
                  <button
                    onClick={() => setActiveView('inventory')}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                      activeView === 'inventory'
                        ? 'bg-[#C1E1C1] text-gray-800 border-2 border-[#B4E7CE]'
                        : 'bg-gray-50 text-gray-700 hover:bg-[#F0FFF0] border-2 border-transparent'
                    }`}
                  >
                    <Package className="w-4 h-4" />
                    <span className="hidden xl:inline">Inventory</span>
                  </button>
                  <button
                    onClick={() => setActiveView('payroll')}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                      activeView === 'payroll'
                        ? 'bg-[#B0E0E6] text-gray-800 border-2 border-[#AEC6CF]'
                        : 'bg-gray-50 text-gray-700 hover:bg-[#F0F8FF] border-2 border-transparent'
                    }`}
                  >
                    <Users className="w-4 h-4" />
                    <span className="hidden xl:inline">Payroll</span>
                  </button>
                  <button
                    onClick={() => setActiveView('export')}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                      activeView === 'export'
                        ? 'bg-[#FFE5B4] text-gray-800 border-2 border-[#FFD700]'
                        : 'bg-gray-50 text-gray-700 hover:bg-[#FFF8DC] border-2 border-transparent'
                    }`}
                  >
                    <Download className="w-4 h-4" />
                    <span className="hidden xl:inline">Export</span>
                  </button>
                  <button
                    onClick={() => setActiveView('attendance')}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                      activeView === 'attendance'
                        ? 'bg-[#FFDAB9] text-gray-800 border-2 border-[#FFB347]'
                        : 'bg-gray-50 text-gray-700 hover:bg-[#FFF5EE] border-2 border-transparent'
                    }`}
                  >
                    <Clock className="w-4 h-4" />
                    <span className="hidden xl:inline">Attendance</span>
                  </button>
                </>
              )}
              <button
                onClick={clearAllData}
                className="flex items-center gap-2 px-3 py-2 bg-[#FFD4D4] text-gray-700 rounded-lg hover:bg-[#FFC0CB] transition-colors border-2 border-[#FFB6C1]"
                title="Clear all data for testing"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden xl:inline">Clear</span>
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden xl:inline">Logout</span>
              </button>
            </div>
          </div>
          
          {/* Mobile Menu */}
          {isMobileMenuOpen && (
            <div className="lg:hidden border-t border-gray-200 py-4 space-y-2">
              {isClusterHead ? (
                <>
                  <button
                    onClick={() => {
                      setActiveView('analytics');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      activeView === 'analytics'
                        ? 'bg-[#D4A5FF] text-gray-800'
                        : 'bg-gray-50 text-gray-700 hover:bg-[#F5F0FF]'
                    }`}
                  >
                    <TrendingUp className="w-5 h-5" />
                    <span>Analytics</span>
                  </button>
                  <button
                    onClick={() => {
                      setActiveView('sales');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      activeView === 'sales'
                        ? 'bg-[#FFD4E5] text-gray-800'
                        : 'bg-gray-50 text-gray-700 hover:bg-[#FFF5F8]'
                    }`}
                  >
                    <DollarSign className="w-5 h-5" />
                    <span>Sales</span>
                  </button>
                  <button
                    onClick={() => {
                      setActiveView('payroll');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      activeView === 'payroll'
                        ? 'bg-[#B0E0E6] text-gray-800'
                        : 'bg-gray-50 text-gray-700 hover:bg-[#F0F8FF]'
                    }`}
                  >
                    <Users className="w-5 h-5" />
                    <span>Payroll</span>
                  </button>
                  <button
                    onClick={() => {
                      setActiveView('export');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      activeView === 'export'
                        ? 'bg-[#FFE5B4] text-gray-800'
                        : 'bg-gray-50 text-gray-700 hover:bg-[#FFF8DC]'
                    }`}
                  >
                    <Download className="w-5 h-5" />
                    <span>Export</span>
                  </button>
                  <button
                    onClick={() => {
                      setActiveView('attendance');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      activeView === 'attendance'
                        ? 'bg-[#FFDAB9] text-gray-800'
                        : 'bg-gray-50 text-gray-700 hover:bg-[#FFF5EE]'
                    }`}
                  >
                    <Clock className="w-5 h-5" />
                    <span>Attendance</span>
                  </button>
                  <button
                    onClick={() => {
                      setActiveView('employees');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      activeView === 'employees'
                        ? 'bg-[#E6E6FA] text-gray-800'
                        : 'bg-gray-50 text-gray-700 hover:bg-[#F8F8FF]'
                    }`}
                  >
                    <UserPlus className="w-5 h-5" />
                    <span>Employees</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setActiveView('analytics');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      activeView === 'analytics'
                        ? 'bg-[#D4A5FF] text-gray-800'
                        : 'bg-gray-50 text-gray-700 hover:bg-[#F5F0FF]'
                    }`}
                  >
                    <TrendingUp className="w-5 h-5" />
                    <span>Analytics</span>
                  </button>
                  <button
                    onClick={() => {
                      setActiveView('sales');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      activeView === 'sales'
                        ? 'bg-[#FFD4E5] text-gray-800'
                        : 'bg-gray-50 text-gray-700 hover:bg-[#FFF5F8]'
                    }`}
                  >
                    <DollarSign className="w-5 h-5" />
                    <span>Sales</span>
                  </button>
                  <button
                    onClick={() => {
                      setActiveView('inventory');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      activeView === 'inventory'
                        ? 'bg-[#C1E1C1] text-gray-800'
                        : 'bg-gray-50 text-gray-700 hover:bg-[#F0FFF0]'
                    }`}
                  >
                    <Package className="w-5 h-5" />
                    <span>Inventory</span>
                  </button>
                  <button
                    onClick={() => {
                      setActiveView('payroll');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      activeView === 'payroll'
                        ? 'bg-[#B0E0E6] text-gray-800'
                        : 'bg-gray-50 text-gray-700 hover:bg-[#F0F8FF]'
                    }`}
                  >
                    <Users className="w-5 h-5" />
                    <span>Payroll</span>
                  </button>
                  <button
                    onClick={() => {
                      setActiveView('export');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      activeView === 'export'
                        ? 'bg-[#FFE5B4] text-gray-800'
                        : 'bg-gray-50 text-gray-700 hover:bg-[#FFF8DC]'
                    }`}
                  >
                    <Download className="w-5 h-5" />
                    <span>Export</span>
                  </button>
                  <button
                    onClick={() => {
                      setActiveView('attendance');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      activeView === 'attendance'
                        ? 'bg-[#FFDAB9] text-gray-800'
                        : 'bg-gray-50 text-gray-700 hover:bg-[#FFF5EE]'
                    }`}
                  >
                    <Clock className="w-5 h-5" />
                    <span>Attendance</span>
                  </button>
                </>
              )}
              <button
                onClick={clearAllData}
                className="w-full flex items-center gap-3 px-4 py-3 bg-[#FFD4D4] text-gray-700 rounded-lg hover:bg-[#FFC0CB] transition-colors"
              >
                <Trash2 className="w-5 h-5" />
                <span>Clear All Data</span>
              </button>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <LogOut className="w-5 h-5" />
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Data Error Banner */}
      {dataError && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center gap-2 text-red-800">
            <AlertCircle className="w-5 h-5" />
            <p className="text-sm">{dataError}</p>
            <button
              onClick={() => user && loadData(user.accessToken)}
              className="ml-auto text-sm text-red-600 hover:text-red-700 underline"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoadingData && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center gap-2 text-blue-800">
            <Package className="w-5 h-5 animate-pulse" />
            <p className="text-sm">Loading inventory data...</p>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="pb-6">
        {activeView === 'sales' ? (
          <SalesManagement context={contextValue} />
        ) : activeView === 'inventory' ? (
          <InventoryManagement context={contextValue} />
        ) : activeView === 'payroll' ? (
          <PayrollManagement 
            userRole={user.role as 'manager' | 'cluster_head'} 
            selectedDate={new Date().toISOString().split('T')[0]}
            userEmployeeId={user.employeeId}
            userName={user.name}
          />
        ) : activeView === 'analytics' ? (
          <Analytics context={contextValue} />
        ) : activeView === 'export' ? (
          <ExportData userRole={user.role as 'manager' | 'cluster_head'} />
        ) : activeView === 'attendance' ? (
          <AttendancePortal user={{
            employeeId: user.employeeId,
            name: user.name,
            email: user.email,
            role: user.role
          }} />
        ) : activeView === 'employees' ? (
          <EmployeeManagement user={{
            role: user.role,
            email: user.email,
            employeeId: user.employeeId,
            name: user.name
          }} />
        ) : (
          <ClusterDashboard context={contextValue} />
        )}
      </main>
    </div>
  );
}