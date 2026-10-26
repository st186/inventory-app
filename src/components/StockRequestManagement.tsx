import { useState, useEffect } from 'react';
import { InventoryContextType } from '../App';
import * as api from '../utils/api';
import { Package, Send, CheckCircle, XCircle, Clock, AlertCircle, TrendingUp, Trash2 } from 'lucide-react';
import { getDefaultStoreId } from '../utils/entityAccess';
import { getTodayIST } from '../utils/timezone';
import { StockWastageModal } from './StockWastageModal';

const PRODUCT_LABELS: Record<string, string> = {
 chicken: 'Chicken Momos',
 chickenCheese: 'Chicken Cheese Momos',
 veg: 'Veg Momos',
 cheeseCorn: 'Cheese Corn Momos',
 paneer: 'Paneer Momos',
 vegKurkure: 'Veg Kurkure Momos',
 chickenKurkure: 'Chicken Kurkure Momos',
};

type Props = {
  context: InventoryContextType;
  stores: api.Store[];
  // Notification deep-link: 'pending-fulfillment' jumps straight to that tab (production heads).
  initialTab?: string | null;
};

export function StockRequestManagement({ context, stores, initialTab = null }: Props) {
  const [activeTab, setActiveTab] = useState<'my-requests' | 'pending-fulfillment'>(initialTab === 'pending-fulfillment' ? 'pending-fulfillment' : 'my-requests');

  // A notification click arriving while this component is already mounted should still switch tabs
  useEffect(() => {
    if (initialTab === 'pending-fulfillment') {
      setActiveTab('pending-fulfillment');
    }
  }, [initialTab]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showWastageModal, setShowWastageModal] = useState(false);
  const [fulfillmentForm, setFulfillmentForm] = useState<{
    requestId: string | null;
    quantities: Record<string, number>;
    notes: string;
  }>({
    requestId: null,
    quantities: {},
    notes: '',
  });

  const isStoreIncharge = context.user?.designation === 'store_incharge';
  const isProductionHead = context.user?.designation === 'production_incharge';
  // Resolved via the explicit assignedStoreIds/assignedProductionHouseIds mapping
  // (falling back to the legacy single-storeId guess for employees not yet migrated) -
  // a production incharge's storeId holds their production house's own id, not a
  // store's, so stores.find(s => s.id === ...) never matched for them directly. See
  // src/utils/entityAccess.ts.
  const userStoreId = getDefaultStoreId(context.user, stores);
  const userStore = stores.find(s => s.id === userStoreId);
  const userProductionHouse = context.productionHouses.find(h => h.productionHeadId === context.user?.employeeId);

  // No "Current Stock" here: it was every fulfilled old-style request minus (number of sales
  // records / 7), which is not a stock figure, so it is no longer shown.

  // Form state for new request
  const [requestForm, setRequestForm] = useState({
    chicken: 0,
    chickenCheese: 0,
    veg: 0,
    cheeseCorn: 0,
    paneer: 0,
    vegKurkure: 0,
    chickenKurkure: 0,
  });

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!userStore) {
      alert('You must be assigned to a store to create requests');
      return;
    }

    if (!userStore.productionHouseId) {
      alert('Your store is not mapped to any production house. Contact cluster head.');
      return;
    }

    const productionHouse = context.productionHouses.find(h => h.id === userStore.productionHouseId);
    if (!productionHouse) {
      alert('Production house not found');
      return;
    }

    // Validate that at least one quantity is greater than 0
    const hasQuantity = Object.values(requestForm).some(qty => qty > 0);
    if (!hasQuantity) {
      alert('Please enter at least one quantity greater than 0');
      return;
    }

    try {
      const requestData = {
        storeId: userStore.id,
        storeName: userStore.name,
        productionHouseId: productionHouse.id,
        productionHouseName: productionHouse.name,
        requestedBy: context.user?.employeeId || '',
        requestedByName: context.user?.name || '',
        requestDate: getTodayIST(),
        requestedQuantities: requestForm,
      };
      
      console.log('🔵 FRONTEND: About to create stock request with data:', requestData);
      console.log('🔵 User employeeId:', context.user?.employeeId);
      console.log('🔵 User name:', context.user?.name);
      console.log('🔵 Has access token:', !!context.user?.accessToken);
      
      await context.createStockRequest(requestData);

      console.log('✅ FRONTEND: Stock request created successfully!');
      alert('Stock request created successfully!');
      setShowCreateForm(false);
      setRequestForm({
        chicken: 0,
        chickenCheese: 0,
        veg: 0,
        cheeseCorn: 0,
        paneer: 0,
        vegKurkure: 0,
        chickenKurkure: 0,
      });
    } catch (error) {
      console.error('❌ FRONTEND: Error creating stock request:', error);
      console.error('❌ Error details:', JSON.stringify(error, null, 2));
      alert('Failed to create stock request. Please try again.');
    }
  };

  const handleFulfillRequest = async (request: api.StockRequest) => {
    if (!userProductionHouse) return;

    // Pre-fill with requested quantities (user can adjust)
    setFulfillmentForm({
      requestId: request.id,
      quantities: { ...request.requestedQuantities },
      notes: '',
    });
  };

  const submitFulfillment = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!fulfillmentForm.requestId) return;

    try {
      await context.fulfillStockRequest(
        fulfillmentForm.requestId,
        fulfillmentForm.quantities as any,
        context.user?.employeeId || '',
        context.user?.name || '',
        fulfillmentForm.notes || undefined
      );

      alert('Stock request fulfilled successfully!');
      setFulfillmentForm({ requestId: null, quantities: {}, notes: '' });
    } catch (error) {
      console.error('Error fulfilling request:', error);
      alert('Failed to fulfill request. Please try again.');
    }
  };

  // Filter requests based on user role
  const myRequests = isStoreIncharge 
    ? context.stockRequests.filter(r => r.storeId === context.user?.storeId)
    : [];

  const pendingRequests = isProductionHead && userProductionHouse
    ? context.stockRequests.filter(r => r.productionHouseId === userProductionHouse.id && r.status === 'pending')
    : [];

  // When only one role applies there's no tab switcher to change activeTab (see the
  // Tabs section below), so force the right content to show regardless of its value.
  const effectiveTab: 'my-requests' | 'pending-fulfillment' =
    (isStoreIncharge && isProductionHead) ? activeTab : (isProductionHead ? 'pending-fulfillment' : 'my-requests');

  const getStatusColor = (status: api.StockRequest['status']) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'fulfilled': return 'bg-green-100 text-green-800';
      case 'partially_fulfilled': return 'bg-blue-100 text-blue-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: api.StockRequest['status']) => {
    switch (status) {
      case 'pending': return <Clock className="w-4 h-4" />;
      case 'fulfilled': return <CheckCircle className="w-4 h-4" />;
      case 'partially_fulfilled': return <TrendingUp className="w-4 h-4" />;
      case 'cancelled': return <XCircle className="w-4 h-4" />;
      default: return <AlertCircle className="w-4 h-4" />;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-4 sm:mb-8 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/30 flex-shrink-0">
            <Package className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Stock Request Management</h1>
            <p className="text-sm sm:text-base text-gray-500">
              {isStoreIncharge && 'Request stock from your production house'}
              {isProductionHead && 'Fulfill stock requests from stores'}
            </p>
          </div>
        </div>
        {isStoreIncharge && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => {
                if (!userStoreId) { return; }
                setShowWastageModal(true);
              }}
              className="px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-all flex items-center gap-2"
            >
              <Trash2 className="w-5 h-5" />
              Log Wastage
            </button>
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-4 py-2 bg-gradient-to-r from-orange-600 to-amber-500 text-white rounded-lg hover:shadow-lg transition-all flex items-center gap-2"
            >
              <Send className="w-5 h-5" />
              New Request
            </button>
          </div>
        )}
      </div>

      {isStoreIncharge && showWastageModal && userStoreId && (
        <StockWastageModal
          context={context}
          storeId={userStoreId}
          finishedProducts={Object.entries(PRODUCT_LABELS).map(([camelKey, label]) => ({ camelKey, label }))}
          onClose={() => setShowWastageModal(false)}
        />
      )}

      {/* Warning if store not mapped */}
      {isStoreIncharge && userStore && !userStore.productionHouseId && (
        <div className="mb-6 bg-red-50 border-2 border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <p className="text-red-900">
              Your store is not mapped to any production house. Please contact your cluster head to assign a production house.
            </p>
          </div>
        </div>
      )}

      {/* Tabs - a store incharge and a production incharge are mutually exclusive
          designations, so in practice only one of these ever applies per user. Skip
          the tab bar entirely rather than showing a single lonely pill. */}
      {isStoreIncharge && isProductionHead && (
        <div className="bg-gray-100 rounded-xl p-1 mb-6 flex gap-1">
          <button
            onClick={() => setActiveTab('my-requests')}
            className={`flex-1 px-6 py-3 rounded-lg transition-all font-medium ${
              activeTab === 'my-requests'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            My Requests ({myRequests.length})
          </button>
          <button
            onClick={() => setActiveTab('pending-fulfillment')}
            className={`flex-1 px-6 py-3 rounded-lg transition-all flex items-center justify-center gap-2 font-medium ${
              activeTab === 'pending-fulfillment'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Pending Fulfillment
            {pendingRequests.length > 0 && (
              <span className={`px-2 py-1 rounded-full text-xs ${
                activeTab === 'pending-fulfillment' ? 'bg-orange-500 text-white' : 'bg-gray-300 text-gray-700'
              }`}>
                {pendingRequests.length}
              </span>
            )}
          </button>
        </div>
      )}
      {isStoreIncharge && !isProductionHead && (
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">My Requests ({myRequests.length})</h2>
      )}
      {isProductionHead && !isStoreIncharge && (
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
          Pending Fulfillment
          {pendingRequests.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-blue-600 text-white normal-case font-medium">{pendingRequests.length}</span>
          )}
        </h2>
      )}

      {/* Create Request Form Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 tracking-tight mb-4">Create Stock Request</h2>
            <form onSubmit={handleCreateRequest} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {(Object.keys(PRODUCT_LABELS) as (keyof typeof requestForm)[]).map((key) => (
                  <div key={key}>
                    <label className="block text-sm text-gray-700 mb-1">
                      {PRODUCT_LABELS[key]}
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={requestForm[key]}
                      onChange={(e) => setRequestForm({ ...requestForm, [key]: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                ))}
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Create Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Fulfillment Form Modal */}
      {fulfillmentForm.requestId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 tracking-tight mb-4">Fulfill Stock Request</h2>
            <form onSubmit={submitFulfillment} className="space-y-4">
              <div className="bg-blue-50 rounded-lg p-4 mb-4">
                <p className="text-sm text-blue-900">
                  Adjust quantities based on available inventory. You can fulfill partially if stock is limited.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {Object.entries(fulfillmentForm.quantities).map(([key, value]) => {
                  const available = userProductionHouse?.inventory[key as keyof typeof userProductionHouse.inventory] || 0;
                  return (
                    <div key={key}>
                      <label className="block text-sm text-gray-700 mb-1">
                        {PRODUCT_LABELS[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                        <span className="text-xs text-gray-500 ml-2">(Available: {available})</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        max={available}
                        value={value}
                        onChange={(e) => setFulfillmentForm({
                          ...fulfillmentForm,
                          quantities: { ...fulfillmentForm.quantities, [key]: parseInt(e.target.value) || 0 }
                        })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  );
                })}
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-1">Notes (Optional)</label>
                <textarea
                  value={fulfillmentForm.notes}
                  onChange={(e) => setFulfillmentForm({ ...fulfillmentForm, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                  placeholder="Any notes about this fulfillment..."
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setFulfillmentForm({ requestId: null, quantities: {}, notes: '' })}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  Fulfill Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Requests List */}
      <div className="space-y-4">
        {effectiveTab === 'my-requests' && myRequests.length === 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-12 text-center">
            <Package className="w-16 h-16 mx-auto text-gray-400 mb-4" />
            <h3 className="text-xl font-bold text-gray-900 tracking-tight mb-2">No Stock Requests Yet</h3>
            <p className="text-gray-600">Create your first stock request to get momos from the production house</p>
          </div>
        )}

        {effectiveTab === 'pending-fulfillment' && pendingRequests.length === 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-12 text-center">
            <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
            <h3 className="text-xl font-bold text-gray-900 tracking-tight mb-2">All Caught Up!</h3>
            <p className="text-gray-600">No pending stock requests to fulfill</p>
          </div>
        )}

        {effectiveTab === 'my-requests' && myRequests.map(request => (
          <div key={request.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-lg font-bold text-gray-900 tracking-tight">Request to {request.productionHouseName}</h3>
                  <span className={`px-3 py-1 rounded-full text-xs flex items-center gap-1 ${getStatusColor(request.status)}`}>
                    {getStatusIcon(request.status)}
                    {request.status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
                <p className="text-sm text-gray-600">Requested on {new Date(request.requestDate).toLocaleDateString()}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {Object.entries(request.requestedQuantities).map(([key, value]) => (
                value > 0 && (
                  <div key={key} className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs text-gray-600 mb-1">
                      {PRODUCT_LABELS[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                    </div>
                    <div className="text-lg text-gray-900">
                      {request.fulfilledQuantities ? `${(request.fulfilledQuantities as any)[key]} / ${value}` : value}
                    </div>
                  </div>
                )
              ))}
            </div>

            {request.notes && (
              <div className="bg-blue-50 rounded-lg p-3 mb-4">
                <div className="text-xs text-blue-900 mb-1">Notes from Production Head:</div>
                <div className="text-sm text-blue-900">{request.notes}</div>
              </div>
            )}

            {request.fulfilledBy && (
              <div className="text-sm text-gray-600">
                Fulfilled by {request.fulfilledByName} on {new Date(request.fulfillmentDate!).toLocaleDateString()}
              </div>
            )}
          </div>
        ))}

        {effectiveTab === 'pending-fulfillment' && pendingRequests.map(request => (
          <div key={request.id} className="bg-white rounded-2xl shadow-sm border-2 border-yellow-300 p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-lg font-bold text-gray-900 tracking-tight">Request from {request.storeName}</h3>
                  <span className={`px-3 py-1 rounded-full text-xs flex items-center gap-1 ${getStatusColor(request.status)}`}>
                    {getStatusIcon(request.status)}
                    PENDING
                  </span>
                </div>
                <p className="text-sm text-gray-600">
                  Requested by {request.requestedByName} on {new Date(request.requestDate).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => handleFulfillRequest(request)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                Fulfill
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(request.requestedQuantities).map(([key, value]) => {
                const available = userProductionHouse?.inventory[key as keyof typeof userProductionHouse.inventory] || 0;
                const canFulfill = available >= value;
                
                return value > 0 && (
                  <div key={key} className={`rounded-lg p-3 ${canFulfill ? 'bg-green-50' : 'bg-red-50'}`}>
                    <div className="text-xs text-gray-600 mb-1">
                      {PRODUCT_LABELS[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                    </div>
                    <div className="text-lg text-gray-900">{value}</div>
                    <div className={`text-xs ${canFulfill ? 'text-green-600' : 'text-red-600'}`}>
                      Available: {available}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}