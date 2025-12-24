import { useState, useEffect } from 'react';
import { InventoryManagement } from './components/InventoryManagement';
import { ClusterDashboard } from './components/ClusterDashboard';
import { SalesManagement } from './components/SalesManagement';
import { AuthPage } from './components/AuthPage';
import { Package, BarChart3, LogOut, AlertCircle, DollarSign, Trash2 } from 'lucide-react';
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
  user: { email: string; name: string; role: string; accessToken: string } | null;
};

export default function App() {
  // All useState hooks must be at the top, before any conditional returns
  const [activeView, setActiveView] = useState<'inventory' | 'dashboard' | 'sales'>('inventory');
  const [user, setUser] = useState<{ email: string; name: string; role: string; accessToken: string } | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [overheads, setOverheads] = useState<OverheadItem[]>([]);
  const [salesData, setSalesData] = useState<SalesData[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  // Get singleton Supabase client
  const supabaseClient = getSupabaseClient();

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
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session?.user) {
          const userData = {
            email: session.user.email || '',
            name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User',
            role: session.user.user_metadata?.role || 'manager',
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

  const handleSignup = async (email: string, password: string, name: string, role: 'manager' | 'cluster_head') => {
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
          <Package className="w-12 h-12 text-blue-600 mx-auto mb-4 animate-pulse" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
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
  const currentView = isClusterHead ? 'dashboard' : activeView;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div>
              <h1 className="text-gray-900">Inventory Management System</h1>
              <p className="text-sm text-gray-500">
                Welcome, {user.name} ({user.role === 'manager' ? 'Manager' : 'Cluster Head'})
              </p>
            </div>
            <div className="flex gap-2">
              {!isClusterHead && (
                <>
                  <button
                    onClick={() => setActiveView('sales')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                      activeView === 'sales'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <DollarSign className="w-4 h-4" />
                    Sales
                  </button>
                  <button
                    onClick={() => setActiveView('inventory')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                      activeView === 'inventory'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <Package className="w-4 h-4" />
                    Inventory
                  </button>
                </>
              )}
              <button
                onClick={() => !isClusterHead && setActiveView('dashboard')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  currentView === 'dashboard'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <BarChart3 className="w-4 h-4" />
                Dashboard
              </button>
              <button
                onClick={clearAllData}
                className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                title="Clear all data for testing"
              >
                <Trash2 className="w-4 h-4" />
                Clear Data
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </div>
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
      <main>
        {currentView === 'sales' ? (
          <SalesManagement context={contextValue} />
        ) : currentView === 'inventory' ? (
          <InventoryManagement context={contextValue} />
        ) : (
          <ClusterDashboard context={contextValue} />
        )}
      </main>
    </div>
  );
}